import React, { useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Tag as ChakraTag,
  TagLabel,
  TagCloseButton,
  Button,
  Input,
  HStack,
  VStack,
  useToast,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Checkbox,
  Stack,
  CheckboxGroup,
  Divider
} from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useMount } from 'ahooks';
import { getUserTags, updateUserTags, getAllUsersWithTags } from '@/web/support/user/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

// 用户标签管理页面
const Info = (props: any) => {
  const { isPc } = useSystem();
  const [userTags, setUserTags] = useState<any>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const toast = useToast();

  // 获取用户标签
  const { loading, runAsync: fetchUserTags } = useRequest2(
    async () => {
      const data = await getUserTags();
      setUserTags(data);
      if (data.availableTags) {
        setAvailableTags(data.availableTags);
      }

      return data;
    },
    {
      onError: () => {
        toast({
          title: '加载标签失败',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    }
  );

  // 获取所有用户及其标签
  const { loading: loadingUsers, runAsync: fetchAllUsers } = useRequest2(async () => {
    try {
      const usersData = await getAllUsersWithTags();
      setAllUsers(usersData.users || []);

      // 如果availableTags没有值，使用getAllUsersWithTags返回的可用标签
      if (availableTags.length === 0 && usersData.availableTags) {
        setAvailableTags(usersData.availableTags);
      }

      return usersData;
    } catch (error) {
      toast({
        title: '获取用户列表失败',
        status: 'error',
        duration: 3000
      });
      return null;
    }
  });

  // 初始加载
  useMount(() => {
    // 先加载当前用户标签
    fetchUserTags().then((data) => {
      // 如果是管理员，再加载所有用户
      if (data?.tagInfo?.hasAdminAccess) {
        fetchAllUsers();
      }
    });
  });

  // 删除自己的标签
  const { loading: removingTag, runAsync: removeTag } = useRequest2(
    async (tagToRemove: string) => {
      const updatedTags = (userTags?.tagInfo?.tagsList || []).filter(
        (tag: string) => tag !== tagToRemove
      );

      await updateUserTags({
        tags: updatedTags
      });

      // 刷新数据
      await fetchUserTags();

      toast({
        title: '标签已删除',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '删除标签失败',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    }
  );

  // 打开编辑其他用户标签的模态框
  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setSelectedTags(user.tags || []);
    setNewTag(''); // 清空新标签输入
    onOpen();
  };

  // 打开编辑自己标签的模态框
  const handleEditMyTags = () => {
    setSelectedUser({
      userId: userTags?.tagInfo?.userId || '',
      username: '我',
      tags: userTags?.tagInfo?.tagsList || []
    });
    setSelectedTags(userTags?.tagInfo?.tagsList || []);
    setNewTag('');
    onOpen();
  };

  // 更新用户标签
  const { loading: updating, runAsync: updateUserTagsById } = useRequest2(
    async () => {
      if (!selectedUser) return;

      await updateUserTags({
        targetUserId: selectedUser.username === '我' ? undefined : selectedUser.userId,
        tags: selectedTags
      });

      await fetchUserTags();

      if (userTags?.tagInfo?.hasAdminAccess) {
        await fetchAllUsers();
      }

      onClose();

      toast({
        title: '用户标签已更新',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '更新用户标签失败',
          status: 'error',
          duration: 3000
        });
      }
    }
  );

  // 更新选中标签
  const handleTagChange = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // 添加自定义标签到选中标签
  const { loading: addingTag, runAsync: handleAddCustomTag } = useRequest2(
    async () => {
      if (!newTag.trim()) return;

      // 检查标签是否已存在
      if (selectedTags.includes(newTag.trim())) {
        toast({
          title: '标签已存在',
          status: 'warning',
          duration: 2000
        });
        return;
      }

      // 添加到选中标签
      setSelectedTags([...selectedTags, newTag.trim()]);
      setNewTag('');

      toast({
        title: '标签已添加',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '添加标签失败',
          status: 'error',
          duration: 3000
        });
      }
    }
  );

  return (
    <AccountContainer>
      <Box py={[3, '28px']} px={[5, 10]} mx={'auto'}>
        {isPc ? (
          <Flex direction="column" w="full">
            <Box mb={6}>
              <Flex fontSize="xl" fontWeight="bold" mb={4}>
                用户标签管理
              </Flex>
              <Box fontSize="sm" color="gray.500">
                管理您的用户标签，添加或删除标签以控制权限
              </Box>
            </Box>

            {loading ? (
              <Flex justifyContent="center" py={10}>
                <Spinner />
              </Flex>
            ) : (
              <Box w="full" bg="white" p={6} borderRadius="md" shadow="sm">
                {/* 简化的当前用户标签管理 */}
                <VStack spacing={4} align="stretch" mb={userTags?.tagInfo?.hasAdminAccess ? 8 : 0}>
                  {userTags?.isFirstTime && (
                    <Box bg="blue.50" p={4} borderRadius="md">
                      <Text fontWeight="medium" color="blue.600">
                        您还没有设置任何标签，标签用于控制权限和功能访问。
                        {!userTags?.tagInfo?.hasAdminAccess && <Text>请联系管理员添加</Text>}
                      </Text>
                    </Box>
                  )}
                  {userTags?.tagInfo?.hasAdminAccess && (
                    <Flex justifyContent="space-between" alignItems="center">
                      <Text fontWeight="medium">我的标签</Text>
                      <Button size="sm" colorScheme="blue" onClick={handleEditMyTags}>
                        编辑我的标签
                      </Button>
                    </Flex>
                  )}

                  <Flex flexWrap="wrap" gap={2}>
                    {userTags?.tagInfo?.tagsList?.length > 0 ? (
                      userTags.tagInfo.tagsList.map((tag: string) => (
                        <ChakraTag key={tag} colorScheme="blue" size="md" borderRadius="full">
                          <TagLabel>{tag}</TagLabel>
                        </ChakraTag>
                      ))
                    ) : (
                      <Text color="gray.500" fontSize="sm">
                        暂无标签
                      </Text>
                    )}
                  </Flex>
                </VStack>

                {/* 管理员功能：管理其他用户标签 */}
                {userTags?.tagInfo?.hasAdminAccess && (
                  <>
                    <Divider my={6} />

                    <Box mt={2}>
                      <Text fontWeight="medium" mb={4}>
                        用户标签管理
                      </Text>

                      {loadingUsers ? (
                        <Flex justifyContent="center" py={4}>
                          <Spinner />
                        </Flex>
                      ) : (
                        <Table variant="simple">
                          <Thead>
                            <Tr>
                              <Th>用户名</Th>
                              <Th>标签</Th>
                              <Th>操作</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {allUsers.map((user) => (
                              <Tr key={user.userId}>
                                <Td>{user.username}</Td>
                                <Td>
                                  <Flex flexWrap="wrap" gap={1}>
                                    {(user.tags || []).map((tag: string) => (
                                      <ChakraTag key={tag} size="sm" colorScheme="blue">
                                        {tag}
                                      </ChakraTag>
                                    ))}
                                    {(user.tags || []).length === 0 && (
                                      <Text fontSize="sm" color="gray.500">
                                        无标签
                                      </Text>
                                    )}
                                  </Flex>
                                </Td>
                                <Td>
                                  <Button
                                    size="sm"
                                    colorScheme="blue"
                                    onClick={() => handleEditUser(user)}
                                  >
                                    编辑标签
                                  </Button>
                                </Td>
                              </Tr>
                            ))}
                            {allUsers.length === 0 && (
                              <Tr>
                                <Td colSpan={3} textAlign="center" py={4}>
                                  暂无用户数据
                                </Td>
                              </Tr>
                            )}
                          </Tbody>
                        </Table>
                      )}
                    </Box>

                    {/* 编辑用户标签模态框 */}
                    <Modal isOpen={isOpen} onClose={onClose} size="lg">
                      <ModalOverlay />
                      <ModalContent>
                        <ModalHeader>
                          编辑用户标签 -{' '}
                          {selectedUser?.username === '我' ? '我的标签' : selectedUser?.username}
                        </ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                          <VStack spacing={5} align="stretch">
                            {/* 添加自定义标签 - 移到弹窗中 */}
                            <Box>
                              <Text fontWeight="medium" mb={2}>
                                添加自定义标签
                              </Text>
                              <HStack>
                                <Input
                                  value={newTag}
                                  onChange={(e) => setNewTag(e.target.value)}
                                  placeholder="输入新标签"
                                  size="md"
                                  maxLength={20}
                                  isDisabled={addingTag}
                                />
                                <Button
                                  colorScheme="blue"
                                  onClick={() => handleAddCustomTag()}
                                  isLoading={addingTag}
                                  isDisabled={!newTag.trim()}
                                >
                                  添加
                                </Button>
                              </HStack>
                              <Text mt={1} fontSize="xs" color="gray.500">
                                标签最多20个字符，用于控制功能访问权限
                              </Text>
                            </Box>

                            <Divider />

                            <Box>
                              <Text fontWeight="medium" mb={2}>
                                预定义标签
                              </Text>
                              <CheckboxGroup colorScheme="blue">
                                <Stack spacing={2} direction="column">
                                  {availableTags.map((tag) => (
                                    <Checkbox
                                      key={tag}
                                      value={tag}
                                      isChecked={selectedTags.includes(tag)}
                                      onChange={() => handleTagChange(tag)}
                                    >
                                      {tag}
                                    </Checkbox>
                                  ))}
                                </Stack>
                              </CheckboxGroup>
                            </Box>

                            <Divider />

                            <Box>
                              <Text fontWeight="medium" mb={2}>
                                当前已选标签
                              </Text>
                              <Flex flexWrap="wrap" gap={2}>
                                {selectedTags.map((tag) => (
                                  <ChakraTag key={tag} colorScheme="blue" size="md">
                                    <TagLabel>{tag}</TagLabel>
                                    <TagCloseButton onClick={() => handleTagChange(tag)} />
                                  </ChakraTag>
                                ))}
                                {selectedTags.length === 0 && (
                                  <Text color="gray.500" fontSize="sm">
                                    未选择任何标签
                                  </Text>
                                )}
                              </Flex>
                            </Box>
                          </VStack>
                        </ModalBody>

                        <ModalFooter>
                          <Button variant="ghost" mr={3} onClick={onClose}>
                            取消
                          </Button>
                          <Button
                            colorScheme="blue"
                            onClick={() => updateUserTagsById()}
                            isLoading={updating}
                          >
                            保存
                          </Button>
                        </ModalFooter>
                      </ModalContent>
                    </Modal>
                  </>
                )}
              </Box>
            )}
          </Flex>
        ) : (
          <Box>
            <Text fontSize="xl" fontWeight="bold" mb={4}>
              用户标签管理
            </Text>
            <Box w="full" bg="white" p={4} borderRadius="md" shadow="sm">
              {loading ? (
                <Flex justifyContent="center" py={6}>
                  <Spinner />
                </Flex>
              ) : (
                <VStack spacing={4} align="stretch">
                  <Flex justifyContent="space-between" alignItems="center">
                    <Text fontWeight="medium">我的标签</Text>
                    <Button size="sm" colorScheme="blue" onClick={handleEditMyTags}>
                      编辑
                    </Button>
                  </Flex>

                  <Flex flexWrap="wrap" gap={2}>
                    {userTags?.tagInfo?.tagsList?.length > 0 ? (
                      userTags.tagInfo.tagsList.map((tag: string) => (
                        <ChakraTag key={tag} colorScheme="blue" size="md" borderRadius="full">
                          <TagLabel>{tag}</TagLabel>
                        </ChakraTag>
                      ))
                    ) : (
                      <Text color="gray.500" fontSize="sm">
                        暂无标签
                      </Text>
                    )}
                  </Flex>
                </VStack>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_info', 'user']))
    }
  };
}

export default React.memo(Info);
