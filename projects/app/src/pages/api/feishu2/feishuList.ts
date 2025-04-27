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
const app_access_token = 't-g1044phiODWXYUGLILIWOX3HUF5OIGHS3KPTISQM';
const tenant_access_token = 't-g1044phiODWXYUGLILIWOX3HUF5OIGHS3KPTISQM';

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false
});

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
    }
  },
  {
    collection: 'feishu2'
  }
);

// 使用项目的标准模型创建方式
export const MongoUsersId2 = getMongoModel('feishu2', Feishu2);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 连接数据库
    await connectToDatabase();

    let feishuList = await client.wiki.v2.space.list({
      params: {
        page_size: 20,
        lang: 'en'
      }
    });

    console.log(feishuList);
    return jsonRes(res, {
      data: feishuList.data
    });
  } catch (error) {
    console.error('用户ID操作错误:', error);
    return jsonRes(res, {
      code: 500,
      error: typeof error === 'object' ? (error as any).message || '服务器错误' : '服务器错误'
    });
  }
}

// 使用中间件包装处理函数
export default NextAPI(handler);
