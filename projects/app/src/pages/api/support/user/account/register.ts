import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(11111);
  let newUser = null;
  try {
    const { username, password, avatar, timezone } = req.body;
    console.log(
      username,
      password,
      avatar,
      timezone,
      '::::______username, password, avatar, timezone______'
    );

    // 1. 参数校验
    if (!username || !password) {
      return jsonRes(res, {
        code: 400,
        error: CommonErrEnum.invalidParams
      });
    }

    // 2. 检查用户是否已存在
    const existUser = await MongoUser.findOne({ username });
    if (existUser) {
      return jsonRes(res, {
        code: 400,
        error: UserErrEnum.userExist
      });
    }

    // 3. 创建用户
    newUser = await MongoUser.create({
      username,
      password,
      status: UserStatusEnum.active,
      avatar,
      timezone,
      createTime: new Date(),
      lastedLoginTime: new Date()
    });
    console.log('新用户ID:', newUser._id);
    // 返回用户信息
    return jsonRes(res, {
      data: {
        newUser
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    // 如果用户已创建但后续步骤失败，返回用户基本信息
    return jsonRes(res, {
      code: 500,
      error: error
    });
  }
}

// 添加频率限制中间件
export default NextAPI(
  useIPFrequencyLimit({
    id: 'register',
    seconds: 300, // 5分钟内限制注册次数
    limit: 5, // 最多5次
    force: true
  }),
  handler
);
