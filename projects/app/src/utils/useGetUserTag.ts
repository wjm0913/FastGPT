import { useState, useEffect, useCallback } from 'react';
import { getUserTags } from '@/web/support/user/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

/**
 * 用于获取当前用户标签并检查特定标签是否存在的Hook
 * @param tagToCheck 可选，需要检查的标签名称
 * @returns 返回包含用户标签信息和检查结果的对象
 */
export const useGetUserTag = (tagToCheck?: string) => {
  const [userTagInfo, setUserTagInfo] = useState<any>(null);
  const [hasTag, setHasTag] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // 使用 useRequest2 来请求用户标签
  const {
    loading,
    runAsync: fetchUserTags,
    refresh
  } = useRequest2(
    async () => {
      try {
        const data = await getUserTags();
        setUserTagInfo(data);

        // 如果指定了要检查的标签，判断该标签是否存在
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
    {
      manual: true // 手动触发，而不是自动执行
    }
  );

  // 初始化时获取数据
  useEffect(() => {
    fetchUserTags();
  }, [fetchUserTags]);

  // 当 tagToCheck 变化时更新 hasTag
  useEffect(() => {
    if (userTagInfo?.tagInfo?.tagsList && tagToCheck) {
      setHasTag(userTagInfo.tagInfo.tagsList.includes(tagToCheck));
    } else {
      setHasTag(false);
    }
  }, [tagToCheck, userTagInfo]);

  // 提供检查特定标签的函数
  const checkTag = useCallback(
    (tag: string): boolean => {
      if (!userTagInfo?.tagInfo?.tagsList) return false;
      return userTagInfo.tagInfo.tagsList.includes(tag);
    },
    [userTagInfo]
  );

  // 提供检查多个标签中是否有任一个的函数
  const hasAnyTag = useCallback(
    (tags: string[]): boolean => {
      if (!userTagInfo?.tagInfo?.tagsList) return false;
      return tags.some((tag) => userTagInfo.tagInfo.tagsList.includes(tag));
    },
    [userTagInfo]
  );

  // 提供检查是否拥有所有指定标签的函数
  const hasAllTags = useCallback(
    (tags: string[]): boolean => {
      if (!userTagInfo?.tagInfo?.tagsList) return false;
      return tags.every((tag) => userTagInfo.tagInfo.tagsList.includes(tag));
    },
    [userTagInfo]
  );

  return {
    userTagInfo, // 完整的用户标签信息
    tagsList: userTagInfo?.tagInfo?.tagsList || [], // 用户标签列表
    hasTag, // 当前检查的标签是否存在
    isAdmin: userTagInfo?.tagInfo?.isAdmin || false, // 是否为管理员
    isOwner: userTagInfo?.tagInfo?.isOwner || false, // 是否为拥有者
    hasAdminAccess: userTagInfo?.tagInfo?.hasAdminAccess || false, // 是否有管理权限
    isLoading, // 加载状态
    error, // 错误信息
    refresh, // 刷新数据的函数
    checkTag, // 检查特定标签的函数
    hasAnyTag, // 检查是否有任一标签的函数
    hasAllTags // 检查是否有所有指定标签的函数
  };
};

/**
 * 简化版的Hook，只返回是否拥有特定标签
 * @param tag 需要检查的标签名称
 * @returns 布尔值，表示用户是否拥有该标签
 */
export const useHasTag = (tag: string) => {
  const { hasTag, isLoading, error } = useGetUserTag(tag);
  return { hasTag, isLoading, error };
};

export default useGetUserTag;
