import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { connectionMongo, getMongoModel } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

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
  API_ACCESS = 'api_access', // API访问权限

  APPLICATIONCREATION = 'applicationCreation',
  // 知识库创建
  KNOWLEDGE_BASE_CREATE = 'knowledgeBaseCreate',
  // 模型
  THE_AI_MODEL = 'theAIModel'
}

// 修改 Schema，添加应用标签和知识库标签字段
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
    // 新增应用标签数组
    appTags: {
      type: [String], // 存储应用ID
      default: []
    },
    // 新增知识库标签数组
    datasetTags: {
      type: [String], // 存储知识库ID
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

// 检查用户是否有特定应用标签
export const hasAppTag = (user: any, appId: string) => {
  return user?.appTags?.includes(appId) || false;
};

// 检查用户是否有特定知识库标签
export const hasDatasetTag = (user: any, datasetId: string) => {
  return user?.datasetTags?.includes(datasetId) || false;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 连接数据库
    await connectToDatabase();

    if (req.method === 'GET' && req.query.updateSchema === 'true') {
      // 仅当管理员请求时运行此操作
      const { userId } = await authCert({ req, authToken: true });
      const currentUser = await MongoUser.findById(userId);

      if (!currentUser || currentUser.username !== 'root') {
        return jsonRes(res, {
          code: 403,
          error: '只有root用户才能更新数据库结构'
        });
      }

      // 更新所有文档，确保它们都有 appTags 和 datasetTags 字段
      const result = await MongoUsersId2.updateMany(
        { $or: [{ appTags: { $exists: false } }, { datasetTags: { $exists: false } }] },
        {
          $set: {
            appTags: [],
            datasetTags: []
          }
        }
      );

      return jsonRes(res, {
        data: {
          message: '数据库结构已更新',
          updated: result.modifiedCount
        }
      });
    }

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
        // 检查当前用户是否为root账号
        const currentUser = await MongoUser.findById(userId);

        if (!currentUser || currentUser.username !== 'root') {
          return jsonRes(res, {
            code: 403,
            error: '只有root用户才能管理所有用户标签'
          });
        }

        // 查询所有用户
        const allUsers = await MongoUser.find({}, { _id: 1, username: 1 });
        const allUserTags = await MongoUsersId2.find({});

        // 查询所有应用和知识库以便在前端显示名称
        const allApps = await MongoApp.find({}, { _id: 1, name: 1 });
        const allDatasets = await MongoDataset.find({}, { _id: 1, name: 1 });

        // 构建应用和知识库的映射表，以便快速查找名称
        const appMap = new Map();
        const datasetMap = new Map();

        allApps.forEach((app) => {
          appMap.set(app._id.toString(), app.name);
        });

        allDatasets.forEach((dataset) => {
          datasetMap.set(dataset._id.toString(), dataset.name);
        });

        // 合并用户信息和标签信息
        const usersWithTags = allUsers.map((user) => {
          // @ts-ignore
          const tagInfo = allUserTags.find((tag) => tag.userId === user._id.toString());

          // 获取应用和知识库标签，带上名称
          // @ts-ignore
          const appTags = (tagInfo?.appTags || []).map((id) => ({
            id: id,
            name: appMap.get(id) || '未知应用'
          }));
          // @ts-ignore
          const datasetTags = (tagInfo?.datasetTags || []).map((id) => ({
            id: id,
            name: datasetMap.get(id) || '未知知识库'
          }));

          return {
            userId: user._id.toString(),
            username: user.username,
            // @ts-ignore
            tags: tagInfo?.tags || [],
            // 添加应用和知识库标签
            appTags,
            datasetTags
          };
        });

        return jsonRes(res, {
          data: {
            users: usersWithTags,
            availableTags: Object.values(UserTagEnum),
            // 添加可用的应用和知识库列表
            availableApps: allApps.map((app) => ({ id: app._id.toString(), name: app.name })),
            availableDatasets: allDatasets.map((dataset) => ({
              id: dataset._id.toString(),
              name: dataset.name
            }))
          }
        });
      }

      // 查询应用和知识库列表
      const apps = await MongoApp.find({}, { _id: 1, name: 1 });
      const datasets = await MongoDataset.find({}, { _id: 1, name: 1 });

      // 目标用户 ID，查询该用户
      const targetUserId = userId;

      // 查询用户信息
      let user = await MongoUsersId2.findOne({ userId: targetUserId });

      // 如果用户不存在，创建初始记录
      if (!user) {
        user = await MongoUsersId2.create({
          userId: targetUserId,
          tags: [],
          appTags: [],
          datasetTags: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // 解析用户标签信息
      // @ts-ignore
      const userTags = user.tags || [];
      // @ts-ignore
      const userAppTags = user.appTags || [];
      // @ts-ignore
      const userDatasetTags = user.datasetTags || [];

      // 添加应用和知识库名称信息
      const appTagsWithName = userAppTags.map((id: string) => {
        const app = apps.find((app) => app._id.toString() === id);
        return {
          id: id,
          name: app ? app.name : '未知应用'
        };
      });

      const datasetTagsWithName = userDatasetTags.map((id: string) => {
        const dataset = datasets.find((dataset) => dataset._id.toString() === id);
        return {
          id: id,
          name: dataset ? dataset.name : '未知知识库'
        };
      });

      // 检查用户是否有任何标签
      const hasNoTags = userTags.length === 0;
      const currentUser: { username: string } | null = await MongoUser.findById(userId);

      // 返回用户信息标签
      return jsonRes(res, {
        data: {
          // 添加解析后的标签信息
          tagInfo: {
            isOwner: userTags.includes(UserTagEnum.OWNER),
            isAdmin: userTags.includes(UserTagEnum.ADMIN),
            hasAdminAccess:
              currentUser?.username === 'root' || userTags.includes(UserTagEnum.ADMIN),
            canCreateContent: userTags.includes(UserTagEnum.CREATOR),
            canEditTeam: userTags.includes(UserTagEnum.TEAM_MANAGER),
            canInviteUsers: userTags.includes(UserTagEnum.TEAM_MANAGER),
            // 返回原始标签数组
            tagsList: userTags
          },
          // 添加应用和知识库标签
          appTags: appTagsWithName,
          datasetTags: datasetTagsWithName,
          isFirstTime: hasNoTags,
          availableTags: Object.values(UserTagEnum),
          // 添加可用的应用和知识库列表
          availableApps: apps.map((app) => ({ id: app._id.toString(), name: app.name })),
          availableDatasets: datasets.map((dataset) => ({
            id: dataset._id.toString(),
            name: dataset.name
          }))
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

      // 检查当前用户是否为root账号
      const currentUser = await MongoUser.findById(userId);

      if (!currentUser || currentUser.username !== 'root') {
        return jsonRes(res, {
          code: 403,
          error: '只有root用户才能修改其他用户的标签'
        });
      }

      // 从请求体中获取更新的数据
      const { targetUserId, tags, appTags, datasetTags } = req.body;

      console.log(targetUserId, tags, appTags, datasetTags, '更新用户标签-=-=-==-=::::::::::');

      // 如果是自己修改自己，或者是root用户，则允许操作
      const isSelfUpdate = !targetUserId || targetUserId === userId;
      const isRootUser = currentUser && currentUser.username === 'root';

      if (!isSelfUpdate && !isRootUser) {
        return jsonRes(res, {
          code: 403,
          error: '只有root用户才能修改其他用户的标签'
        });
      }

      // 构建更新对象
      const updateData: {
        updatedAt: Date;
        tags?: string[];
        appTags?: string[];
        datasetTags?: string[];
      } = {
        updatedAt: new Date()
      };

      // 确保更新中明确转换类型，避免可能的隐式转换问题
      if (tags !== undefined) {
        updateData.tags = Array.isArray(tags) ? tags : [];
      }
      if (appTags !== undefined) {
        updateData.appTags = Array.isArray(appTags) ? appTags : [];
      }
      if (datasetTags !== undefined) {
        updateData.datasetTags = Array.isArray(datasetTags) ? datasetTags : [];
      }
      console.log(updateData, '-=-=-=-::::S::S:S:::S:updateDataupdateDataupdateData');
      // 更新用户信息
      const updatedUser: any = await MongoUsersId2.findOneAndUpdate(
        { userId: targetUserId || userId },
        { $set: updateData },
        { new: true, upsert: true }
      );

      // 添加一个日志，确认数据已正确存储

      console.log('Updated user:', {
        userId: updatedUser.userId,
        tags: updatedUser.tags,
        appTags: updatedUser.appTags, // 验证是否成功保存
        datasetTags: updatedUser.datasetTags // 验证是否成功保存
      });

      // 查询应用和知识库列表以便返回名称
      const apps = await MongoApp.find(
        {
          _id: { $in: updatedUser.appTags || [] }
        },
        { _id: 1, name: 1 }
      );

      const datasets = await MongoDataset.find(
        {
          _id: { $in: updatedUser.datasetTags || [] }
        },
        { _id: 1, name: 1 }
      );

      // 添加名称信息
      const appTagsWithName = (updatedUser.appTags || []).map((id: string) => {
        const app = apps.find((app) => app._id.toString() === id);
        return {
          id: id,
          name: app ? app.name : '未知应用'
        };
      });

      const datasetTagsWithName = (updatedUser.datasetTags || []).map((id: string) => {
        const dataset = datasets.find((dataset) => dataset._id.toString() === id);
        return {
          id: id,
          name: dataset ? dataset.name : '未知知识库'
        };
      });

      return jsonRes(res, {
        data: {
          // @ts-ignore
          userId: updatedUser.userId,
          // @ts-ignore
          tags: updatedUser.tags,
          // 添加应用和知识库标签
          appTags: appTagsWithName,
          datasetTags: datasetTagsWithName,
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
