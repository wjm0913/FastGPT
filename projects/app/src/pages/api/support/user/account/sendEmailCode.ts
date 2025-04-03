import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectionMongo, getMongoModel } from '@fastgpt/service/common/mongo';
import nodemailer from 'nodemailer';

// 使用正确的项目连接方式
const { Schema } = connectionMongo;

// 创建验证码存储模型
const EmailVerificationSchema = new Schema(
  {
    email: { type: String, required: true, index: true },
    code: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 } // 10分钟后过期
  },
  {
    collection: 'email_verifications'
  }
);

// 使用项目的标准模型创建方式
export const MongoEmailVerification = getMongoModel<{
  email: string;
  code: number;
  createdAt: string;
}>('email_verifications', EmailVerificationSchema);

// 配置邮件发送服务
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.example.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || 'user@example.com',
    pass: process.env.EMAIL_PASS || 'password'
  }
});

// 生成6位随机验证码
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { email } = req.body;

    // 参数校验
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonRes(res, {
        code: 400,
        error: CommonErrEnum.invalidParams
      });
    }

    // 检查邮箱是否已被注册
    try {
      const existUser = await MongoUser.findOne({ username: email });
      if (existUser) {
        return jsonRes(res, {
          code: 400,
          error: '该邮箱已被注册'
        });
      }
    } catch (error) {
      console.error('查询用户失败:', error);
      // 继续执行，不阻止流程
    }

    // 生成验证码
    const verificationCode = generateVerificationCode();

    // 直接在控制台输出验证码用于测试
    console.log(`===============================`);
    console.log(`验证码: ${verificationCode} 发送到邮箱: ${email}`);
    console.log(`===============================`);

    // 保存验证码到数据库
    try {
      // 先删除旧验证码
      await MongoEmailVerification.deleteMany({ email });

      // 创建新验证码
      await MongoEmailVerification.create({
        email,
        code: verificationCode,
        createdAt: new Date()
      });

      console.log('验证码保存成功');
    } catch (dbError) {
      console.error('保存验证码到数据库失败:', dbError);
      return jsonRes(res, {
        code: 500,
        error: '验证码生成失败，请稍后再试'
      });
    }

    // 发送验证码邮件
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"出行AI问答" <noreply@example.com>',
      to: email,
      subject: '出行AI问答 - 邮箱验证码',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2>出行AI问答 邮箱验证</h2>
          <p>您好！</p>
          <p>您正在注册 出行AI问答 账号，验证码为：</p>
          <div style="background-color: #f4f4f4; padding: 10px; font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0;">
            ${verificationCode}
          </div>
          <p>验证码有效期为 10 分钟，请尽快完成注册。</p>
          <p>如果这不是您本人操作，请忽略此邮件。</p>
          <p>此邮件为系统自动发送，请勿回复。</p>
        </div>
      `
    };

    // 发送邮件
    try {
      await transporter.sendMail(mailOptions);
      console.log('邮件发送成功');
    } catch (emailError) {
      console.error('发送邮件失败:', emailError);
      return jsonRes(res, {
        code: 500,
        error: '验证码发送失败，请稍后再试'
      });
    }

    return jsonRes(res, {
      data: {
        success: true,
        message: '验证码已发送至邮箱'
      }
    });
  } catch (error) {
    console.error('发送邮件验证码错误:', error);
    return jsonRes(res, {
      code: 500,
      error:
        typeof error === 'object' ? (error as any).message || '发送验证码失败' : '发送验证码失败'
    });
  }
}

// 添加频率限制中间件
export default NextAPI(
  useIPFrequencyLimit({
    id: 'sendEmailCode',
    seconds: 60, // 1分钟内限制发送次数
    limit: 3, // 最多3次
    force: true
  }),
  handler
);
