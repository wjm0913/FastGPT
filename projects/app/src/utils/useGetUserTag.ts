import { useState, useEffect, useCallback } from 'react';
import { getUserTags } from '@/web/support/user/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

// 定义资源项类型
interface ResourceItem {
  [key: string]: any;
}

// 权限标签类型
interface TagItem {
  id: string;
  name: string;
}

/**
 * 根据权限标签筛选资源列表
 * 此函数可以独立使用，无需hook
 */
export const filterResourcesByTags = async (
  resourceList: ResourceItem[],
  type: string
): Promise<any> => {
  const data = await getUserTags();
  let arrObj = data[type];
  // 获取权限ID列表
  const authorizedIds = arrObj.map((tag: { id: any }) => tag.id);
  // 返回有权限的资源
  return resourceList.filter((resource) => authorizedIds.includes(resource._id));
};

/**
 * 用户标签和权限Hook
 */
export const useGetUserTag = (tagToCheck?: string) => {
  const [userTagInfo, setUserTagInfo] = useState<any>(null);
  const [hasTag, setHasTag] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // 获取用户标签数据
  const {
    loading,
    runAsync: fetchUserTags,
    refresh
  } = useRequest2(
    async () => {
      try {
        const data = await getUserTags();
        setUserTagInfo(data);

        // 检查特定标签
        if (tagToCheck && data?.tagInfo?.tagsList) {
          setHasTag(data.tagInfo.tagsList.includes(tagToCheck));
        } else {
          setHasTag(false);
        }

        return data;
      } catch (err) {
        setError(err as Error);
        setHasTag(false);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    { manual: true }
  );

  // 初始加载
  useEffect(() => {
    fetchUserTags();
  }, [fetchUserTags]);

  // 标签检查更新
  useEffect(() => {
    if (userTagInfo?.tagInfo?.tagsList && tagToCheck) {
      setHasTag(userTagInfo.tagInfo.tagsList.includes(tagToCheck));
    } else {
      setHasTag(false);
    }
  }, [tagToCheck, userTagInfo]);

  // 核心功能：检查用户是否有指定标签
  const checkTag = useCallback(
    (tag: string): boolean => {
      if (!userTagInfo?.tagInfo?.tagsList) return false;
      return userTagInfo.tagInfo.tagsList.includes(tag);
    },
    [userTagInfo]
  );

  return {
    // 用户数据
    userInfo: userTagInfo,
    tags: userTagInfo?.tagInfo?.tagsList || [],
    appTags: userTagInfo?.appTags || [],
    datasetTags: userTagInfo?.datasetTags || [],

    // 状态
    isLoading,
    error,
    hasTag,

    // 权限检查
    isAdmin: userTagInfo?.tagInfo?.isAdmin || false,
    isOwner: userTagInfo?.tagInfo?.isOwner || false,
    hasAdminAccess: userTagInfo?.tagInfo?.hasAdminAccess || false,
    // 核心方法
    refresh,
    checkTag,

    // 静态工具方法
    filterResourcesByTags
  };
};

/**
 * 简化版Hook：检查用户是否有特定标签
 */
export const useHasTag = (tag: string) => {
  const { hasTag, isLoading, error } = useGetUserTag(tag);
  return { hasTag, isLoading, error };
};

export default useGetUserTag;
