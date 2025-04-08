import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { connectionMongo, getMongoModel } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';

// 使用正确的项目连接方式
const { Schema } = connectionMongo;

// 标签枚举，用于权限控制
export enum UserTagEnum {
  // 系统角色标签
  OWNER = 'owner', // 所有者
  ADMIN = 'admin', // 管理员
  TEAM_MANAGER = 'team_manager', // 团队管理

  // 功能权限标签
  CREATOR = 'creator', // 可创建内容
  EDITOR = 'editor', // 可编辑内容
  VIEWER = 'viewer', // 只读权限

  // 数据访问标签
  DATA_ADMIN = 'data_admin', // 数据管理权限
  REPORT_ACCESS = 'report_access', // 报表访问权限
  API_ACCESS = 'api_access' // API访问权限
}

// 简化的Schema，只保留必要字段
const UsersId2Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    username: {
      type: String
    },
    // 标签数组
    tags: {
      type: [String],
      default: []
    },
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
    collection: 'users_id_2'
  }
);

// 使用项目的标准模型创建方式
export const MongoUsersId2 = getMongoModel('users_id_2', UsersId2Schema);

// 检查用户是否有特定标签
export const hasTag = (user: any, tag: string) => {
  return user?.tags?.includes(tag) || false;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 连接数据库
    await connectToDatabase();

    if (req.method === 'GET') {
      // GET: 获取用户信息
      const { userId } = await authCert({ req, authToken: true });

      if (!userId) {
        return jsonRes(res, {
          code: 401,
          error: '用户未登录'
        });
      }

      // 如果请求有 allUsers 参数且为 true，返回所有用户
      if (req.query.allUsers === 'true') {
        // 查询当前用户权限
        const currentUserTag = await MongoUsersId2.findOne({ userId });

        // 检查是否有管理权限
        if (
          currentUserTag &&
          // @ts-ignore
          (currentUserTag.tags.includes(UserTagEnum.ADMIN) ||
            currentUserTag.tags.includes(UserTagEnum.OWNER))
        ) {
          // 查询所有用户
          const allUsers = await MongoUser.find({}, { _id: 1, username: 1 });
          const allUserTags = await MongoUsersId2.find({});

          // 合并用户信息和标签信息
          const usersWithTags = allUsers.map((user) => {
            // @ts-ignore
            const tagInfo = allUserTags.find((tag) => tag.userId === user._id.toString());
            return {
              userId: user._id.toString(),
              username: user.username,
              // @ts-ignore
              tags: tagInfo?.tags || []
            };
          });

          return jsonRes(res, {
            data: {
              users: usersWithTags,
              availableTags: Object.values(UserTagEnum)
            }
          });
        } else {
          return jsonRes(res, {
            code: 403,
            error: '没有管理权限'
          });
        }
      }

      // 如果请求有目标用户 ID，查询该用户
      const targetUserId = (req.query.userId as string) || userId;

      // 查询用户信息
      let user = await MongoUsersId2.findOne({ userId: targetUserId });

      // 如果用户不存在，创建初始记录
      if (!user) {
        user = await MongoUsersId2.create({
          userId: targetUserId,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // 解析用户标签信息
      // @ts-ignore
      const userTags = user.tags || [];

      // 检查用户是否有任何标签
      const hasNoTags = userTags.length === 0;

      // 返回用户信息标签
      return jsonRes(res, {
        data: {
          // 添加解析后的标签信息
          tagInfo: {
            isOwner: userTags.includes(UserTagEnum.OWNER),
            isAdmin: userTags.includes(UserTagEnum.ADMIN),
            hasAdminAccess:
              userTags.includes(UserTagEnum.OWNER) || userTags.includes(UserTagEnum.ADMIN),
            canCreateContent: userTags.includes(UserTagEnum.CREATOR),
            canEditTeam: userTags.includes(UserTagEnum.TEAM_MANAGER),
            canInviteUsers: userTags.includes(UserTagEnum.TEAM_MANAGER),
            // 返回原始标签数组
            tagsList: userTags
          },
          isFirstTime: hasNoTags,
          availableTags: Object.values(UserTagEnum)
        }
      });
    } else if (req.method === 'POST') {
      // POST: 更新用户标签
      const { userId } = await authCert({ req, authToken: true });

      if (!userId) {
        return jsonRes(res, {
          code: 401,
          error: '用户未登录'
        });
      }

      // 检查当前用户是否有管理权限
      const currentUser = await MongoUsersId2.findOne({ userId });

      // 如果是自己修改自己，或者有管理权限，则允许操作
      const isSelfUpdate = !req.body.targetUserId || req.body.targetUserId === userId;
      const hasAdminPermission =
        currentUser &&
        // @ts-ignore
        (currentUser.tags.includes(UserTagEnum.ADMIN) ||
          currentUser.tags.includes(UserTagEnum.OWNER));

      if (!isSelfUpdate && !hasAdminPermission) {
        return jsonRes(res, {
          code: 403,
          error: '没有权限修改其他用户的标签'
        });
      }

      const { targetUserId, tags } = req.body;

      // 更新用户信息
      const updatedUser = await MongoUsersId2.findOneAndUpdate(
        { userId: targetUserId || userId },
        {
          $set: {
            tags: tags,
            updatedAt: new Date()
          }
        },
        { new: true, upsert: true }
      );

      return jsonRes(res, {
        data: {
          // @ts-ignore
          userId: updatedUser.userId,
          // @ts-ignore
          tags: updatedUser.tags,
          updated: true
        }
      });
    }

    // 不支持的方法
    return jsonRes(res, {
      code: 405,
      error: '不支持的方法'
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
