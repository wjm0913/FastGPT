import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoEmailVerification } from './sendEmailCode'; // 导入验证码模型
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, password, timezone, code: verificationCode } = req.body;
    console.log(username, password, timezone, verificationCode, '::::______注册信息______');

    // 1. 参数校验
    if (!username || !password || !verificationCode) {
      return jsonRes(res, {
        code: 400,
        error: CommonErrEnum.invalidParams
      });
    }

    // 2. 验证邮箱验证码
    let verificationValid = false;

    try {
      // 查询验证码
      const verification = await MongoEmailVerification.findOne({ email: username });
      console.log(verification);
      // 检查验证码是否正确
      if (verification && verification?.code === verificationCode) {
        verificationValid = true;
        // 验证成功后删除验证码记录
        await MongoEmailVerification.deleteOne({ email: username });
      }
    } catch (error) {
      console.error('验证验证码失败:', error);
      return jsonRes(res, {
        code: 500,
        error: '系统错误，请稍后再试'
      });
    }

    // 验证码无效时返回错误
    if (!verificationValid) {
      return jsonRes(res, {
        code: 400,
        error: '验证码错误或已过期'
      });
    }

    // 3. 检查用户是否已存在
    const existUser = await MongoUser.findOne({ username });
    if (existUser) {
      return jsonRes(res, {
        code: 400,
        error: UserErrEnum.userExist
      });
    }

    // 4. 创建用户
    let newUser = await MongoUser.create({
      username,
      password,
      status: UserStatusEnum.active,
      timezone,
      createTime: new Date(),
      lastedLoginTime: new Date()
    });

    const defaultTeam = await MongoTeam.findOne({ name: 'My Team' });
    console.log(defaultTeam);
    // 将新用户添加到默认团队
    const newTeamMember = await MongoTeamMember.create({
      teamId: defaultTeam?._id,
      userId: newUser._id,
      role: 'admin',
      status: 'active',
      defaultTeam: true
    });
    console.log(newTeamMember);

    // 返回用户信息
    return jsonRes(res, {
      data: {
        success: true,
        message: '注册成功'
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
