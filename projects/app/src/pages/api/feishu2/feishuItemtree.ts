import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { connectionMongo, getMongoModel } from '@fastgpt/service/common/mongo';
// import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { connectToDatabase } from '@/service/mongo';
// import { MongoUser } from '@fastgpt/service/support/user/schema';
// import { MongoApp } from '@fastgpt/service/core/app/schema';
// import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import * as lark from '@larksuiteoapi/node-sdk';
// https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=cli_a608d0dd07fd900d&redirect_uri=https://labai.gydev.cn/

const appId = 'cli_a608d0dd07fd900d';
const appSecret = 'GiIHE0T31SoY9F7OjcyDlbF1omk6nE5f';

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false
});

// 飞书API实际返回的节点类型
interface LarkNode {
  space_id?: string;
  node_token?: string;
  obj_token?: string;
  obj_type?: string;
  node_type?: string;
  origin_node_token?: string;
  owner_id?: string;
  owner_type?: string;
  create_time?: number;
  update_time?: number;
  title?: string;
  has_child?: boolean;
  parent_node_token?: string;
  creator?: string;
  document_detail?: any; // 添加文档详细信息字段
}

// 我们的飞书节点类型（含子节点）
interface FeishuTreeNode extends LarkNode {
  children: FeishuTreeNode[];
  sync_status?: 'not_synced' | 'syncing' | 'synced'; // 添加同步状态字段
}

// 飞书API响应类型
interface FeishuNodeResponse {
  items: LarkNode[];
  has_more?: boolean;
  page_token?: string;
}

// 使用正确的项目连接方式
const { Schema } = connectionMongo;
// 修改 Schema，添加应用标签和知识库标签字段
const Feishu2 = new Schema(
  {
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    space_id: {
      // 确保这个字段被正确定义
      type: String,
      required: true,
      index: true // 加索引，加速查询
    },
    tree_data: {
      type: [Schema.Types.Mixed], // 明确定义为数组类型
      default: [] // 默认值为空数组而非空对象
    },
    last_updated: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'feishu2',
    strict: false, // 设置模型整体为非严格模式
    strictQuery: false // 设置查询模式为非严格
  }
);

// 使用项目的标准模型创建方式
export const MongoFeishu2 = getMongoModel('feishu2', Feishu2);

// 创建一个睡眠函数
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 限制API请求频率的计数器和上次请求时间
let requestCount = 0;
let lastRequestTime = Date.now();

// 获取单个文档的详细信息
async function getDocumentDetail(objToken: string): Promise<any> {
  try {
    if (!objToken) return null;

    // 限制请求频率
    requestCount++;

    // 每3次请求或距离上次请求不到5秒，则等待
    if (requestCount % 3 === 0 || Date.now() - lastRequestTime < 5000) {
      console.log(`限制请求频率，等待5秒... (文档ID: ${objToken})`);
      await sleep(5000);
    }

    // 更新最后请求时间
    lastRequestTime = Date.now();

    const response = await client.docx.v1.document.get({
      path: {
        document_id: objToken
      }
    });

    return response.data;
  } catch (error) {
    console.error(`获取文档 ${objToken} 详细信息失败:`);
    return null;
  }
}

// 分批处理数组，返回批次数组
function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

// 递归获取节点子节点，并构建树形结构
async function getNodeChildren(
  spaceId: string,
  parentNodeToken: string,
  depth: number = 0,
  maxDepth: number = 20
): Promise<FeishuTreeNode[]> {
  // 防止无限递归
  if (depth >= maxDepth) {
    return [];
  }

  try {
    // 获取节点的子节点
    const response = await client.wiki.v2.spaceNode.list({
      path: {
        space_id: spaceId
      },
      params: {
        parent_node_token: parentNodeToken
      }
    });

    if (!response || !response.data || !response.data.items || response.data.items.length === 0) {
      return [];
    }

    const items = response.data.items;

    // 分批处理节点，每批次最多3个
    const batches = batchArray(items, 3);
    let result: FeishuTreeNode[] = [];

    // 按批次处理，避免并行请求过多
    for (const batch of batches) {
      // 每批次内并行处理
      const batchResults = await Promise.all(
        batch.map(async (node) => {
          // 获取文档详细信息
          let documentDetail = null;
          if (node.obj_token) {
            documentDetail = await getDocumentDetail(node.obj_token);
          }
          console.log(
            'documentDetail+++递归获取节点子节点，并构建树形结构',
            documentDetail.document.revision_id
          );
          // 如果节点有子节点，递归获取
          if (node.has_child === true) {
            try {
              // 递归调用前等待一点时间，避免请求过于频繁
              await sleep(1000);
              const children = await getNodeChildren(
                spaceId,
                node.node_token || '',
                depth + 1,
                maxDepth
              );
              return {
                ...node,
                document_detail: documentDetail,
                revision_id: documentDetail?.document.revision_id,
                sync_status: 'not_synced' as const, // 使用const断言确保类型正确
                children
              } as FeishuTreeNode;
            } catch (error) {
              console.error(`获取节点 ${node.node_token} 的子节点失败:`, error);
              return {
                ...node,
                document_detail: documentDetail,
                revision_id: documentDetail?.document.revision_id,
                sync_status: 'not_synced' as const, // 使用const断言确保类型正确
                children: []
              } as FeishuTreeNode;
            }
          }
          return {
            ...node,
            document_detail: documentDetail,
            revision_id: documentDetail?.document.revision_id,
            sync_status: 'not_synced' as const, // 使用const断言确保类型正确
            children: []
          } as FeishuTreeNode;
        })
      );

      // 合并批次结果
      result = [...result, ...batchResults];

      // 批次间暂停，避免并发请求过多
      if (batches.length > 1) {
        await sleep(3000);
      }
    }

    return result;
  } catch (error) {
    console.error(`获取空间 ${spaceId} 父节点 ${parentNodeToken} 的子节点失败:`, error);
    return [];
  }
}

// 处理顶级节点的函数，同样使用批量处理
async function processRootNodes(
  rootNodes: LarkNode[],
  spaceIdString: string
): Promise<FeishuTreeNode[]> {
  if (!rootNodes || rootNodes.length === 0) {
    return [];
  }

  // 分批处理根节点，每批次最多3个
  const batches = batchArray(rootNodes, 3);
  let result: FeishuTreeNode[] = [];

  // 按批次处理
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (node) => {
        // 获取文档详细信息
        let documentDetail = null;
        if (node.obj_token) {
          documentDetail = await getDocumentDetail(node.obj_token);
        }
        console.log(
          'documentDetail+++处理顶级节点的函数，同样使用批量处理',
          documentDetail.document
        );
        if (node.has_child === true) {
          try {
            // 递归调用前等待一点时间
            await sleep(1000);
            const children = await getNodeChildren(spaceIdString, node.node_token || '');
            return {
              ...node,
              document_detail: documentDetail,
              revision_id: documentDetail?.document.revision_id,
              sync_status: 'not_synced' as const, // 使用const断言确保类型正确
              children
            } as FeishuTreeNode;
          } catch (error) {
            console.error(`获取顶级节点 ${node.node_token} 的子节点失败:`, error);
            return {
              ...node,
              document_detail: documentDetail,
              revision_id: documentDetail?.document.revision_id,
              sync_status: 'not_synced' as const, // 使用const断言确保类型正确
              children: []
            } as FeishuTreeNode;
          }
        }
        return {
          ...node,
          document_detail: documentDetail,
          revision_id: documentDetail?.document.revision_id,
          sync_status: 'not_synced' as const, // 使用const断言确保类型正确
          children: []
        } as FeishuTreeNode;
      })
    );

    // 合并批次结果
    result = [...result, ...batchResults];

    // 批次间暂停
    if (batches.length > 1) {
      await sleep(3000);
    }
  }

  return result;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 连接数据库
    await connectToDatabase();

    const { space_id, parent_node_token, refresh } = req.query;

    if (!space_id) {
      return jsonRes(res, {
        code: 400,
        error: '缺少必要参数 space_id'
      });
    }

    const spaceIdString = space_id as string;
    const parentNodeString = (parent_node_token as string) || '';
    const forceRefresh = refresh === 'true';
    console.log('forceRefresh', {
      forceRefresh,
      forceRefreshType: refresh === 'true',
      spaceIdString,
      parentNodeString
    });

    // 如果不是强制刷新，先尝试从数据库获取
    if (!forceRefresh) {
      console.log(`尝试从数据库获取空间 ${spaceIdString} 的数据`);
      try {
        // 从数据库获取数据，确保使用非严格查询模式
        const dbData: any = await MongoFeishu2.findOne({ space_id: spaceIdString }, null, {
          strictQuery: false
        }).lean(); // 使用lean()获取纯JSON对象

        console.log('dbData类型:', typeof dbData);
        console.log('dbData是否存在:', !!dbData);
        console.log('dbData是否存在:', dbData);
        if (dbData) {
          console.log('dbData.tree_data类型:', typeof dbData.tree_data);
          console.log('dbData.tree_data是否存在:', !!dbData.tree_data);
          console.log('dbData.tree_data是否为数组:', Array.isArray(dbData.tree_data));

          // 尝试提取树结构，无论它是直接存储的数组还是包装在items字段中的数组
          let treeItems = null;

          if (Array.isArray(dbData.tree_data)) {
            // 如果tree_data是数组，直接使用
            treeItems = dbData.tree_data;
            console.log('直接从tree_data数组获取，长度:', treeItems.length);
          }

          if (treeItems && treeItems.length > 0) {
            console.log(`从数据库成功获取到空间 ${spaceIdString} 的数据，直接返回`);
            // 构造API响应格式返回数据
            return jsonRes(res, {
              data: {
                items: treeItems,
                has_more: false,
                page_token: '',
                updatedAt: dbData.updatedAt
              }
            });
          }
        }

        console.log(`数据库中未找到有效的树结构数据，将从API获取`);
      } catch (dbError) {
        console.error('数据库查询出错:', dbError);
        console.log('数据库查询失败，将从API获取数据');
      }
    }

    console.log(`从飞书API获取空间 ${spaceIdString} 的数据`);

    // 如果提供了父节点token，获取其子节点
    if (parent_node_token) {
      const children = await getNodeChildren(spaceIdString, parentNodeString);
      return jsonRes(res, {
        data: {
          items: children,
          has_more: false,
          page_token: ''
        }
      });
    }

    // 获取顶级节点列表
    const rootNodesResponse = await client.wiki.v2.spaceNode.list({
      path: {
        space_id: spaceIdString
      }
    });

    if (!rootNodesResponse || !rootNodesResponse.data) {
      return jsonRes(res, {
        data: {
          items: [],
          has_more: false,
          page_token: ''
        }
      });
    }

    // 使用优化的处理函数处理顶级节点
    const treeData = await processRootNodes(rootNodesResponse.data.items || [], spaceIdString);

    // 构造与API响应格式一致的数据
    const responseData = {
      items: treeData,
      has_more: rootNodesResponse.data.has_more || false,
      page_token: rootNodesResponse.data.page_token || ''
    };

    // 将树结构数据存储到数据库中
    try {
      // 检查数据准备情况
      console.log('准备存储的tree_data是否为数组:', Array.isArray(treeData));
      console.log('准备存储的tree_data长度:', treeData.length);

      // 尝试存储到数据库，如果失败不影响返回结果
      await MongoFeishu2.findOneAndUpdate(
        { space_id: spaceIdString },
        {
          $set: {
            tree_data: treeData,
            last_updated: new Date()
          }
        },
        {
          upsert: true,
          new: true,
          strict: false,
          strictQuery: false
        }
      );

      console.log(`已成功将空间 ${spaceIdString} 的树结构保存到数据库`);

      // 验证存储
      try {
        const verifyData: any = await MongoFeishu2.findOne({ space_id: spaceIdString }, null, {
          strictQuery: false
        }).lean();

        if (verifyData) {
          console.log('验证存储数据: tree_data类型 =', typeof verifyData?.tree_data);
          console.log('验证存储数据: tree_data是否为数组 =', Array.isArray(verifyData?.tree_data));
          if (Array.isArray(verifyData?.tree_data)) {
            console.log('验证存储数据: tree_data长度 =', verifyData.tree_data.length);
          } else {
            console.error(
              '验证存储数据: tree_data不是数组，实际类型为',
              typeof verifyData?.tree_data
            );
          }
        } else {
          console.log('验证存储：未找到数据');
        }
      } catch (verifyError) {
        console.error('验证存储数据时出错:', verifyError);
      }
    } catch (dbError) {
      console.error(`将树结构保存到数据库失败:`, dbError);
      // 即使保存失败也继续返回API结果
    }

    // 接口返回
    return jsonRes(res, {
      data: responseData
    });
  } catch (error) {
    console.error('飞书知识库操作错误:', error);
    return jsonRes(res, {
      code: 500,
      error: typeof error === 'object' ? (error as any).message || '服务器错误' : '服务器错误'
    });
  }
}

// 使用中间件包装处理函数
export default NextAPI(handler);
