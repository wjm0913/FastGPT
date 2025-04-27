import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { connectToDatabase } from '@/service/mongo';
import { MongoFeishu2 } from '@/pages/api/feishu2/feishuItemtree';
import * as lark from '@larksuiteoapi/node-sdk';
import * as path from 'path';
import * as fs from 'fs';
import { createDataset } from '@/pages/api/core/dataset/create';
import { createCollection } from '@/pages/api/core/dataset/collection/create';
import { createLocalFileCollection } from '@/pages/api/core/dataset/collection/create/localFile';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// 飞书应用凭证
const appId = 'cli_a608d0dd07fd900d';
const appSecret = 'GiIHE0T31SoY9F7OjcyDlbF1omk6nE5f';

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false
});

// 处理非法文件名字符
function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { space_id, name, intro } = req.query;
    if (!space_id) {
      return jsonRes(res, { code: 400, error: '缺少必要参数 space_id' });
    }
    const responseDatasetIdObj = await createDataset({
      type: 'dataset',
      avatar: 'core/dataset/commonDatasetColor',
      name: String(name || '默认名称'),
      intro: String(intro || ''),
      vectorModel: 'bge-large:latest',
      agentModel: 'qwen2.5',
      vlmModel: 'qwen-vl-plus'
    });
    // 使用字符串形式的 Dataset ID
    const responseDatasetId = responseDatasetIdObj.toString();

    const spaceIdString = space_id as string;
    console.log(`尝试从数据库获取空间 ${spaceIdString} 的数据`);

    const dbData: any = await MongoFeishu2.findOne({ space_id: spaceIdString }, null, {
      strictQuery: false
    }).lean();
    if (!dbData || !dbData.tree_data || dbData.tree_data.length === 0) {
      return jsonRes(res, { code: 404, error: '未找到对应数据' });
    }

    console.log(
      `从数据库成功获取到空间 ${spaceIdString} 的数据, 文档数: ${dbData.tree_data.length}`
    );

    const downloadDir = path.resolve(process.cwd(), 'downloads', spaceIdString);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    function countNodes(nodes: any[]): number {
      let count = 0;
      for (const node of nodes) {
        if (node.has_child && node.children?.length) {
          count += countNodes(node.children);
        } else {
          count += 1;
        }
      }
      return count;
    }
    const totalCount = countNodes(dbData.tree_data);

    let successCount = 0;
    const failList: { title: string; reason: string }[] = [];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    // 递归导出处理
    async function exportTree(nodes: any[], parentPath: string, parentCollectionId: string) {
      for (const node of nodes) {
        const title = node.title || '未知文档';
        const safeTitle = sanitizeFileName(title);
        const currentPath = path.join(parentPath, safeTitle);

        if (node.has_child) {
          // 是目录，创建目录继续递归
          if (!fs.existsSync(currentPath)) {
            fs.mkdirSync(currentPath, { recursive: true });
          }
          const newCollectionIdObj = await createCollection({
            parentId: parentCollectionId,
            datasetId: responseDatasetId,
            name: safeTitle,
            type: 'folder'
          });
          // 使用字符串形式的 Collection ID

          node.collection_id = newCollectionIdObj.toString();
          console.log(
            '11111----111111',
            typeof newCollectionIdObj,
            newCollectionIdObj,
            newCollectionIdObj.toString()
          );
          console.log(node.collection_id);
          console.log('2222----2222222222', newCollectionIdObj, newCollectionIdObj.toString());
        }

        // 无论是否有子节点，都尝试导出保存
        try {
          await sleep(1000);

          console.log(`开始导出文档: ${title}`);

          // 动态根据 obj_type 选择导出类型和扩展名
          const fileTypeMapping: Record<string, { type: string; extension: string }> = {
            doc: { type: 'doc', extension: 'docx' },
            sheet: { type: 'sheet', extension: 'xlsx' },
            bitable: { type: 'bitable', extension: 'xlsx' },
            docx: { type: 'docx', extension: 'docx' }
          };
          const mapping = fileTypeMapping[node.obj_type || 'docx'] || fileTypeMapping['docx'];
          const createRes = await client.drive.v1.exportTask.create({
            data: {
              file_extension: mapping.extension as any,
              token: node.obj_token,
              type: mapping.type as any
            }
          });

          const ticket = createRes?.data?.ticket;
          if (!ticket) {
            throw new Error('创建导出任务失败');
          }

          let exportResult: any = null;
          for (let retry = 0; retry < 10; retry++) {
            const getRes = await client.drive.v1.exportTask.get({
              path: { ticket },
              params: { token: node.obj_token }
            });

            if (getRes?.data?.result?.job_status === 0) {
              exportResult = getRes.data.result;
              break;
            }
            await sleep(2000);
          }

          if (!exportResult) {
            throw new Error('导出超时');
          }

          const downloadRes = await client.drive.v1.exportTask.download({
            path: { file_token: exportResult.file_token }
          });

          const filePath = `${currentPath}.${exportResult.file_extension}`;

          await downloadRes.writeFile(filePath);

          console.log(`保存成功: ${filePath}`);
          successCount++;

          // 更新节点状态
          node.sync_status = 'downloaded';

          res.write(
            `data: ${JSON.stringify({
              successCount,
              currentTitle: title,
              progressPercent: Math.floor(((successCount + failList.length) / totalCount) * 100)
            })}\n\n`
          );
        } catch (error: any) {
          console.error(`文档导出失败: ${title}`, error);
          failList.push({ title, reason: error?.message || '未知错误' });

          node.sync_status = 'downloadFailed';

          res.write(
            `data: ${JSON.stringify({
              successCount,
              currentTitle: title,
              error: true,
              progressPercent: Math.floor(((successCount + failList.length) / totalCount) * 100)
            })}\n\n`
          );
        }

        if (node.has_child && node.children && node.children.length > 0) {
          await exportTree(node.children, currentPath, node.collection_id || parentCollectionId);
        }
      }
    }

    // 从根节点开始导出
    await exportTree(dbData.tree_data, downloadDir, '');

    // 保存失败列表
    const failListPath = path.join(downloadDir, 'failList.json');
    fs.writeFileSync(failListPath, JSON.stringify(failList, null, 2));
    console.log(`失败列表已保存: ${failListPath}`);

    // 构建简化的树结构，仅包含 title 和 collection_id
    function buildDatasetTree(nodes: any[]): any[] {
      return nodes.map((node) => {
        const item: any = {
          title: node.title || '未知文档',
          collection_id: typeof node.collection_id === 'object' ? null : node.collection_id
        };
        if (node.children && node.children.length > 0) {
          item.children = buildDatasetTree(node.children);
        }
        return item;
      });
    }
    const simplifiedTree = buildDatasetTree(dbData.tree_data);

    // 保存 sync_status 更新后的数据到数据库
    await MongoFeishu2.updateOne(
      { space_id: spaceIdString },
      {
        dataset_tree_data: simplifiedTree,
        dataset_id: responseDatasetId,
        tree_data: dbData.tree_data,
        ast_updated: new Date()
      },
      {
        upsert: true,
        new: true,
        strict: false,
        strictQuery: false
      }
    );

    // 按照  simplifiedTree 数据 递归上传文档，文件下载在 downloads 下 space_id 文件下了
    // 上传本地文档
    async function uploadTreeFiles(nodes: any[], parentId: string, parentPath: string) {
      for (const node of nodes) {
        const title = node.title;
        const safeTitle = sanitizeFileName(title);
        const currentPath = path.join(parentPath, safeTitle);
        const filePathDocx = `${currentPath}.docx`;
        const filePathXlsx = `${currentPath}.xlsx`;

        const nextParentId = node.collection_id || parentId; // 当前节点的 collection_id，如果没有就继承 parentId

        // 1. 无论有没有 children，都先检查本地是否有对应文件，有就上传
        let filePath = '';
        if (fs.existsSync(filePathDocx)) {
          filePath = filePathDocx;
        } else if (fs.existsSync(filePathXlsx)) {
          filePath = filePathXlsx;
        }

        if (filePath) {
          const simulatedBodyData = {
            datasetId: responseDatasetId,
            parentId: parentId, // ⚡注意：这里 parentId 是传进来的 parentId，不是 node 自己的 collection_id
            trainingType: 'qa',
            chunkSize: 16000,
            chunkSplitter: '',
            qaPrompt: '',
            metadata: {}
          };

          const simulatedReq: any = {
            headers: req.headers,
            method: 'POST',
            file: {
              path: filePath,
              originalname: path.basename(filePath),
              encoding: 'utf-8',
              mimetype: `application/${path.extname(filePath).replace('.', '')}`
            },
            body: {
              data: JSON.stringify(simulatedBodyData)
            }
          };

          console.log(`开始上传文件: ${filePath} 到 collection_id: ${parentId}`);
          await createLocalFileCollection(simulatedReq, res);
        } else {
          console.log(`本地没有找到对应文件，跳过: ${safeTitle}`);
        }

        // 2. 如果有子节点，递归处理
        if (node.children && node.children.length > 0) {
          await uploadTreeFiles(node.children, nextParentId, currentPath);
        }
      }
    }

    // 上传所有文件
    await sleep(5000);
    await uploadTreeFiles(simplifiedTree, '', downloadDir);
    console.log('所有文件上传完成');
    // 导出完成
    res.write(
      `data: ${JSON.stringify({ done: true, total: successCount + failList.length, successCount, failList, progressPercent: 100 })}\n\n`
    );
    res.end();
  } catch (error) {
    console.error('飞书知识库导出接口异常:', error);
    return jsonRes(res, {
      code: 500,
      error: typeof error === 'object' ? (error as any).message || '服务器错误' : '服务器错误'
    });
  }
}

export default NextAPI(handler);
