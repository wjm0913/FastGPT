import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { connectionMongo, getMongoModel } from '@fastgpt/service/common/mongo';
import { connectToDatabase } from '@/service/mongo';
import * as lark from '@larksuiteoapi/node-sdk';

// ================== 配置 ==================
const appId = 'cli_a608d0dd07fd900d';
const appSecret = 'GiIHE0T31SoY9F7OjcyDlbF1omk6nE5f';

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false
});

// ================== Schema ==================
const { Schema } = connectionMongo;

const Feishu2 = new Schema(
  {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    space_id: { type: String, required: true, index: true },
    dataset_id: { type: String, required: true },
    tree_data: { type: [Schema.Types.Mixed], default: [] },
    dataset_tree_data: { type: [Schema.Types.Mixed], default: [] },
    last_updated: { type: Date, default: Date.now }
  },
  {
    collection: 'feishu2',
    strict: false,
    strictQuery: false
  }
);

export const MongoFeishu2 = getMongoModel('feishu2', Feishu2);

// ================== 工具函数 ==================
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const failedDocumentTokens: string[] = [];
const objTokenToNodeMap: Record<string, FeishuTreeNode> = {}; // 用于动态补节点

let requestCount = 0;
let lastRequestTime = Date.now();

// ================== 类型 ==================
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
  document_detail?: any;
}

interface FeishuTreeNode extends LarkNode {
  children: FeishuTreeNode[];
  sync_status?: 'not_synced' | 'syncing' | 'synced';
  revision_id?: string;
}

interface FeishuNodeResponse {
  items: LarkNode[];
  has_more?: boolean;
  page_token?: string;
}

// ================== 核心函数 ==================
async function getDocumentDetail(objToken: string): Promise<any> {
  if (!objToken) return null;
  try {
    requestCount++;
    if (requestCount % 3 === 0 || Date.now() - lastRequestTime < 5000) {
      console.log(`限制请求频率，等待5秒... (文档ID: ${objToken})`);
      await sleep(5000);
    }
    lastRequestTime = Date.now();

    const response = await client.docx.v1.document.get({
      path: { document_id: objToken }
    });

    return response.data;
  } catch (error) {
    console.error(`首次获取文档 ${objToken} 失败，记录到失败列表`);
    failedDocumentTokens.push(objToken);
    return null;
  }
}

function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

async function getNodeChildren(
  spaceId: string,
  parentNodeToken: string,
  depth = 0,
  maxDepth = 20
): Promise<FeishuTreeNode[]> {
  if (depth >= maxDepth) return [];

  try {
    const response = await client.wiki.v2.spaceNode.list({
      path: { space_id: spaceId },
      params: { parent_node_token: parentNodeToken }
    });

    if (!response?.data?.items?.length) return [];

    const items = response.data.items;
    const batches = batchArray(items, 3);
    let result: FeishuTreeNode[] = [];

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (node) => {
          let documentDetail = null;
          if (node.obj_token) {
            documentDetail = await getDocumentDetail(node.obj_token);
          }

          const children = node.has_child
            ? await getNodeChildren(spaceId, node.node_token || '', depth + 1, maxDepth)
            : [];

          const treeNode: FeishuTreeNode = {
            ...node,
            document_detail: documentDetail,
            revision_id: documentDetail?.document?.revision_id,
            sync_status: 'not_synced',
            children
          };

          if (node.obj_token) {
            objTokenToNodeMap[node.obj_token] = treeNode;
          }

          return treeNode;
        })
      );

      result = [...result, ...batchResults];
      if (batches.length > 1) await sleep(3000);
    }

    return result;
  } catch (error) {
    console.error(`获取空间 ${spaceId} 父节点 ${parentNodeToken} 的子节点失败:`, error);
    return [];
  }
}

async function processRootNodes(rootNodes: LarkNode[], spaceId: string): Promise<FeishuTreeNode[]> {
  if (!rootNodes.length) return [];

  const batches = batchArray(rootNodes, 3);
  let result: FeishuTreeNode[] = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (node) => {
        let documentDetail = null;
        if (node.obj_token) {
          documentDetail = await getDocumentDetail(node.obj_token);
        }

        const children = node.has_child
          ? await getNodeChildren(spaceId, node.node_token || '')
          : [];

        const treeNode: FeishuTreeNode = {
          ...node,
          document_detail: documentDetail,
          revision_id: documentDetail?.document?.revision_id.toString(),
          sync_status: 'not_synced',
          children
        };

        if (node.obj_token) {
          objTokenToNodeMap[node.obj_token] = treeNode;
        }

        return treeNode;
      })
    );

    result = [...result, ...batchResults];
    if (batches.length > 1) await sleep(3000);
  }

  return result;
}

// ================== API Handler ==================
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { space_id, parent_node_token, refresh } = req.query;
    if (!space_id) {
      return jsonRes(res, { code: 400, error: '缺少必要参数 space_id' });
    }

    const spaceIdString = space_id as string;
    const forceRefresh = refresh === 'true';

    if (!forceRefresh) {
      const dbData: any = await MongoFeishu2.findOne({ space_id: spaceIdString }, null, {
        strictQuery: false
      }).lean();
      if (dbData?.tree_data?.length > 0) {
        return jsonRes(res, {
          data: {
            items: dbData.tree_data,
            has_more: false,
            page_token: '',
            updatedAt: dbData.updatedAt
          }
        });
      }
    }

    if (parent_node_token) {
      const children = await getNodeChildren(spaceIdString, parent_node_token as string);
      return jsonRes(res, { data: { items: children, has_more: false, page_token: '' } });
    }

    const rootNodesResponse = await client.wiki.v2.spaceNode.list({
      path: { space_id: spaceIdString }
    });
    // @ts-ignore
    const treeData = await processRootNodes(rootNodesResponse?.data?.items || [], spaceIdString);

    // 统一重试失败文档并动态补节点
    if (failedDocumentTokens.length > 0) {
      console.warn('开始统一重试失败文档，数量:', failedDocumentTokens.length);

      const retryTokens = [...failedDocumentTokens];
      failedDocumentTokens.length = 0;

      for (const token of retryTokens) {
        try {
          const docDetail = await getDocumentDetail(token);
          if (!docDetail) {
            console.error(`重试仍失败: ${token}`);
            failedDocumentTokens.push(token);
          } else {
            console.log(`重试成功: ${token}`);
            const node = objTokenToNodeMap[token];
            if (node) {
              node.document_detail = docDetail;
              node.revision_id = docDetail.document?.revision_id.toString();
            }
          }
        } catch (err) {
          console.error(`重试异常: ${token}`, err);
          failedDocumentTokens.push(token);
        }
      }

      if (failedDocumentTokens.length > 0) {
        console.error('最终失败文档:', failedDocumentTokens);
      } else {
        console.log('所有文档已成功补齐 ✅');
      }
    }

    await MongoFeishu2.findOneAndUpdate(
      { space_id: spaceIdString },
      { $set: { tree_data: treeData, last_updated: new Date() } },
      { upsert: true, new: true, strict: false, strictQuery: false }
    );

    return jsonRes(res, { data: { items: treeData, has_more: false, page_token: '' } });
  } catch (error) {
    console.error('飞书知识库操作错误:', error);
    return jsonRes(res, {
      code: 500,
      error: typeof error === 'object' ? (error as any).message || '服务器错误' : '服务器错误'
    });
  }
}

// ================== 导出 ==================
export default NextAPI(handler);
