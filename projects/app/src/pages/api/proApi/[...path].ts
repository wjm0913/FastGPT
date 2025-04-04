import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { request } from 'http';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { path = [], ...query } = req.query as any;
    const requestPath = `/api/${path?.join('/')}?${new URLSearchParams(query).toString()}`;

    if (!requestPath) {
      throw new Error('url is empty');
    }

    // console.log({ req, res }, '------NextApiRequest----req, resreq, res::::---');
    // if (!FastGPTProUrl) {
    //   throw new Error(`未配置商业版链接1111: ${path}`);
    // }

    console.log(FastGPTProUrl, '-----::::-=-=-=-');
    const parsedUrl = new URL(FastGPTProUrl);
    console.log(parsedUrl, '-----::::-=-=-=-');
    delete req.headers?.rootkey;

    const requestResult = request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: requestPath,
      method: req.method,
      headers: req.headers
    });
    req.pipe(requestResult);

    requestResult.on('response', (response) => {
      Object.keys(response.headers).forEach((key) => {
        // @ts-ignore
        res.setHeader(key, response.headers[key]);
      });
      response.statusCode && res.writeHead(response.statusCode);
      response.pipe(res);
    });

    requestResult.on('error', (e) => {
      res.send(e);
      res.end();
    });
  } catch (error) {
    console.log(error, '-----::::-=-=-=-wjkjkjkjkjkjkjk');
    jsonRes(res, {
      code: 500,
      error: '敬请期待'
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
