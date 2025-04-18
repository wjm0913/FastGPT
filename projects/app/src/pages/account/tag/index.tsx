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
  Divider,
  Tabs,
  TabList,
  TabPanels,
  TabPanel,
  Select,
  Tab
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
  const [activeTab, setActiveTab] = useState(0);
  const [selectedApp, setSelectedApp] = useState('');
  const [selectedAppTags, setSelectedAppTags] = useState<string[]>([]);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [selectedDatasetTags, setSelectedDatasetTags] = useState<string[]>([]);
  const [availableApps, setAvailableApps] = useState<{ id: string; name: string }[]>([]);
  const [availableDatasets, setAvailableDatasets] = useState<{ id: string; name: string }[]>([]);

  // 获取用户标签
  const { loading, runAsync: fetchUserTags } = useRequest2(
    async () => {
      const data = await getUserTags();
      setUserTags(data);
      if (data.availableTags) {
        setAvailableTags(data.availableTags);
      }
      if (data.availableApps) {
        setAvailableApps(data.availableApps);
      }
      if (data.availableDatasets) {
        setAvailableDatasets(data.availableDatasets);
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

      if (availableTags.length === 0 && usersData.availableTags) {
        setAvailableTags(usersData.availableTags);
      }
      if (availableApps.length === 0 && usersData.availableApps) {
        setAvailableApps(usersData.availableApps);
      }
      if (availableDatasets.length === 0 && usersData.availableDatasets) {
        setAvailableDatasets(usersData.availableDatasets);
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
    setSelectedAppTags(user.appTags?.map((app: { id: any }) => app.id) || []);
    setSelectedDatasetTags(user.datasetTags?.map((dataset: { id: any }) => dataset.id) || []);
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
    setSelectedAppTags(userTags?.appTags?.map((app: { id: any }) => app.id) || []);
    setSelectedDatasetTags(userTags?.datasetTags?.map((dataset: { id: any }) => dataset.id) || []);
    setNewTag('');
    onOpen();
  };

  // 更新用户标签
  const { loading: updating, runAsync: updateUserTagsById } = useRequest2(
    async () => {
      if (!selectedUser) return;

      await updateUserTags({
        targetUserId: selectedUser.username === '我' ? undefined : selectedUser.userId,
        tags: selectedTags,
        appTags: selectedAppTags,
        datasetTags: selectedDatasetTags
      });

      await fetchUserTags();

      if (userTags?.tagInfo?.hasAdminAccess) {
        await fetchAllUsers();
      }

      onClose();

      toast({
        title: '用户权限已更新',
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

  // 添加应用权限
  const { loading: addingAppTag, runAsync: handleAddAppTag } = useRequest2(
    async () => {
      if (!selectedApp) return;

      // 检查应用权限是否已存在
      if (selectedAppTags.includes(selectedApp)) {
        toast({
          title: '应用权限已存在',
          status: 'warning',
          duration: 2000
        });
        return;
      }

      // 添加到选中应用权限
      setSelectedAppTags([...selectedAppTags, selectedApp]);
      setSelectedApp('');

      toast({
        title: '应用权限已添加',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '添加应用权限失败',
          status: 'error',
          duration: 3000
        });
      }
    }
  );

  // 移除应用权限
  const { loading: removingAppTag, runAsync: handleRemoveAppTag } = useRequest2(
    async (appId: string) => {
      const updatedAppTags = selectedAppTags.filter((id) => id !== appId);
      setSelectedAppTags(updatedAppTags);

      await updateUserTags({
        tags: selectedTags,
        appTags: updatedAppTags
      });

      await fetchUserTags();

      toast({
        title: '应用权限已移除',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '移除应用权限失败',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    }
  );

  // 添加知识库权限
  const { loading: addingDatasetTag, runAsync: handleAddDatasetTag } = useRequest2(
    async () => {
      if (!selectedDataset) return;

      // 检查知识库权限是否已存在
      if (selectedDatasetTags.includes(selectedDataset)) {
        toast({
          title: '知识库权限已存在',
          status: 'warning',
          duration: 2000
        });
        return;
      }

      // 添加到选中知识库权限
      setSelectedDatasetTags([...selectedDatasetTags, selectedDataset]);
      setSelectedDataset('');

      toast({
        title: '知识库权限已添加',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '添加知识库权限失败',
          status: 'error',
          duration: 3000
        });
      }
    }
  );

  // 移除知识库权限
  const { loading: removingDatasetTag, runAsync: handleRemoveDatasetTag } = useRequest2(
    async (datasetId: string) => {
      const updatedDatasetTags = selectedDatasetTags.filter((id) => id !== datasetId);
      setSelectedDatasetTags(updatedDatasetTags);

      await updateUserTags({
        tags: selectedTags,
        datasetTags: updatedDatasetTags
      });

      await fetchUserTags();

      toast({
        title: '知识库权限已移除',
        status: 'success',
        duration: 2000
      });
    },
    {
      onError: () => {
        toast({
          title: '移除知识库权限失败',
          status: 'error',
          duration: 3000,
          isClosable: true
        });
      }
    }
  );

  // 根据应用ID获取应用名称的辅助函数
  const getAppName = (appId: string): string => {
    const app = availableApps.find((app) => app.id === appId);
    return app ? app.name : appId;
  };

  // 根据知识库ID获取知识库名称的辅助函数
  const getDatasetName = (datasetId: string): string => {
    const dataset = availableDatasets.find((dataset) => dataset.id === datasetId);
    return dataset ? dataset.name : datasetId;
  };

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
                              <Th>功能标签</Th>
                              <Th>应用权限</Th>
                              <Th>知识库权限</Th>
                              <Th>操作</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {allUsers.map((user) => (
                              <Tr key={user.userId}>
                                <Td>{user.username}</Td>
                                <Td>
                                  <Flex flexWrap="wrap" gap={1} maxW="200px">
                                    {(user.tags || []).length > 0 ? (
                                      (user.tags || []).map((tag: string) => (
                                        <ChakraTag key={tag} size="sm" colorScheme="blue">
                                          {tag}
                                        </ChakraTag>
                                      ))
                                    ) : (
                                      <Text fontSize="sm" color="gray.500">
                                        无标签
                                      </Text>
                                    )}
                                  </Flex>
                                </Td>
                                <Td>
                                  <Flex flexWrap="wrap" gap={1} maxW="200px">
                                    {(user.appTags || []).length > 0 ? (
                                      (user.appTags || []).map(
                                        (app: { id: string; name: string }) => (
                                          <ChakraTag key={app.id} size="sm" colorScheme="green">
                                            {app.name}
                                          </ChakraTag>
                                        )
                                      )
                                    ) : (
                                      <Text fontSize="sm" color="gray.500">
                                        无应用
                                      </Text>
                                    )}
                                  </Flex>
                                </Td>
                                <Td>
                                  <Flex flexWrap="wrap" gap={1} maxW="200px">
                                    {(user.datasetTags || []).length > 0 ? (
                                      (user.datasetTags || []).map(
                                        (dataset: { id: string; name: string }) => (
                                          <ChakraTag
                                            key={dataset.id}
                                            size="sm"
                                            colorScheme="purple"
                                          >
                                            {dataset.name}
                                          </ChakraTag>
                                        )
                                      )
                                    ) : (
                                      <Text fontSize="sm" color="gray.500">
                                        无知识库
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
                                    编辑权限
                                  </Button>
                                </Td>
                              </Tr>
                            ))}
                            {allUsers.length === 0 && (
                              <Tr>
                                <Td colSpan={5} textAlign="center" py={4}>
                                  暂无用户数据
                                </Td>
                              </Tr>
                            )}
                          </Tbody>
                        </Table>
                      )}
                    </Box>

                    {/* 编辑用户标签模态框 */}
                    <Modal isOpen={isOpen} onClose={onClose} size="xl">
                      <ModalOverlay />
                      <ModalContent>
                        <ModalHeader>
                          编辑用户权限 -{' '}
                          {selectedUser?.username === '我' ? '我的权限' : selectedUser?.username}
                        </ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                          <Tabs index={activeTab} onChange={setActiveTab} colorScheme="blue">
                            <TabList>
                              <Tab>功能标签</Tab>
                              <Tab>应用权限</Tab>
                              <Tab>知识库权限</Tab>
                            </TabList>
                            <TabPanels>
                              {/* 功能标签面板 */}
                              <TabPanel px={0} pt={4}>
                                <VStack spacing={5} align="stretch">
                                  <Box>
                                    <Text fontWeight="medium" mb={2}>
                                      添加功能标签
                                    </Text>
                                    <HStack>
                                      <Select
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        placeholder="选择预定义标签"
                                      >
                                        {availableTags
                                          .filter((tag) => !selectedTags.includes(tag))
                                          .map((tag) => (
                                            <option key={tag} value={tag}>
                                              {tag}
                                            </option>
                                          ))}
                                      </Select>
                                      <Button
                                        colorScheme="blue"
                                        onClick={() => handleAddCustomTag()}
                                        isLoading={addingTag}
                                        isDisabled={!newTag}
                                      >
                                        添加
                                      </Button>
                                    </HStack>
                                    <Text mt={1} fontSize="xs" color="gray.500">
                                      选择标签以控制功能访问权限
                                    </Text>
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
                              </TabPanel>

                              {/* 应用权限面板 */}
                              <TabPanel px={0} pt={4}>
                                <VStack spacing={5} align="stretch">
                                  <Box>
                                    <Text fontWeight="medium" mb={2}>
                                      添加应用权限
                                    </Text>
                                    <HStack>
                                      <Select
                                        value={selectedApp}
                                        onChange={(e) => setSelectedApp(e.target.value)}
                                        placeholder="选择应用"
                                      >
                                        {availableApps
                                          .filter((app) => !selectedAppTags.includes(app.id))
                                          .map((app) => (
                                            <option key={app.id} value={app.id}>
                                              {app.name}
                                            </option>
                                          ))}
                                      </Select>
                                      <Button
                                        colorScheme="green"
                                        onClick={handleAddAppTag}
                                        isDisabled={!selectedApp}
                                      >
                                        添加
                                      </Button>
                                    </HStack>
                                    <Text mt={1} fontSize="xs" color="gray.500">
                                      添加应用权限允许用户访问和使用特定应用
                                    </Text>
                                  </Box>

                                  <Divider />

                                  <Box>
                                    <Text fontWeight="medium" mb={2}>
                                      当前应用权限
                                    </Text>
                                    <Flex flexWrap="wrap" gap={2}>
                                      {selectedAppTags.map((appId) => (
                                        <ChakraTag key={appId} colorScheme="green" size="md">
                                          <TagLabel>{getAppName(appId)}</TagLabel>
                                          <TagCloseButton
                                            onClick={() => handleRemoveAppTag(appId)}
                                          />
                                        </ChakraTag>
                                      ))}
                                      {selectedAppTags.length === 0 && (
                                        <Text color="gray.500" fontSize="sm">
                                          未选择任何应用
                                        </Text>
                                      )}
                                    </Flex>
                                  </Box>
                                </VStack>
                              </TabPanel>

                              {/* 知识库权限面板 */}
                              <TabPanel px={0} pt={4}>
                                <VStack spacing={5} align="stretch">
                                  <Box>
                                    <Text fontWeight="medium" mb={2}>
                                      添加知识库权限
                                    </Text>
                                    <HStack>
                                      <Select
                                        value={selectedDataset}
                                        onChange={(e) => setSelectedDataset(e.target.value)}
                                        placeholder="选择知识库"
                                      >
                                        {availableDatasets
                                          .filter(
                                            (dataset) => !selectedDatasetTags.includes(dataset.id)
                                          )
                                          .map((dataset) => (
                                            <option key={dataset.id} value={dataset.id}>
                                              {dataset.name}
                                            </option>
                                          ))}
                                      </Select>
                                      <Button
                                        colorScheme="purple"
                                        onClick={handleAddDatasetTag}
                                        isDisabled={!selectedDataset}
                                      >
                                        添加
                                      </Button>
                                    </HStack>
                                    <Text mt={1} fontSize="xs" color="gray.500">
                                      添加知识库权限允许用户访问和使用特定知识库
                                    </Text>
                                  </Box>

                                  <Divider />

                                  <Box>
                                    <Text fontWeight="medium" mb={2}>
                                      当前知识库权限
                                    </Text>
                                    <Flex flexWrap="wrap" gap={2}>
                                      {selectedDatasetTags.map((datasetId) => (
                                        <ChakraTag key={datasetId} colorScheme="purple" size="md">
                                          <TagLabel>{getDatasetName(datasetId)}</TagLabel>
                                          <TagCloseButton
                                            onClick={() => handleRemoveDatasetTag(datasetId)}
                                          />
                                        </ChakraTag>
                                      ))}
                                      {selectedDatasetTags.length === 0 && (
                                        <Text color="gray.500" fontSize="sm">
                                          未选择任何知识库
                                        </Text>
                                      )}
                                    </Flex>
                                  </Box>
                                </VStack>
                              </TabPanel>
                            </TabPanels>
                          </Tabs>
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
              用户权限管理
            </Text>
            <Box w="full" bg="white" p={4} borderRadius="md" shadow="sm">
              {loading ? (
                <Flex justifyContent="center" py={6}>
                  <Spinner />
                </Flex>
              ) : (
                <VStack spacing={4} align="stretch">
                  <Flex justifyContent="space-between" alignItems="center">
                    <Text fontWeight="medium">我的权限</Text>
                    {userTags?.tagInfo?.hasAdminAccess && (
                      <Button size="sm" colorScheme="blue" onClick={handleEditMyTags}>
                        编辑
                      </Button>
                    )}
                  </Flex>

                  <Tabs variant="enclosed" size="sm" colorScheme="blue">
                    <TabList>
                      <Tab>功能标签</Tab>
                      <Tab>应用</Tab>
                      <Tab>知识库</Tab>
                    </TabList>
                    <TabPanels>
                      <TabPanel px={0} pt={2}>
                        <Flex flexWrap="wrap" gap={2}>
                          {userTags?.tagInfo?.tagsList?.length > 0 ? (
                            userTags.tagInfo.tagsList.map((tag: string) => (
                              <ChakraTag key={tag} colorScheme="blue" size="sm" borderRadius="full">
                                <TagLabel>{tag}</TagLabel>
                              </ChakraTag>
                            ))
                          ) : (
                            <Text color="gray.500" fontSize="sm">
                              暂无标签
                            </Text>
                          )}
                        </Flex>
                      </TabPanel>
                      <TabPanel px={0} pt={2}>
                        <Flex flexWrap="wrap" gap={2}>
                          {userTags?.appTags?.length > 0 ? (
                            userTags.appTags.map((app: { id: string; name: string }) => (
                              <ChakraTag
                                key={app.id}
                                colorScheme="green"
                                size="sm"
                                borderRadius="full"
                              >
                                <TagLabel>{app.name}</TagLabel>
                              </ChakraTag>
                            ))
                          ) : (
                            <Text color="gray.500" fontSize="sm">
                              暂无应用权限
                            </Text>
                          )}
                        </Flex>
                      </TabPanel>
                      <TabPanel px={0} pt={2}>
                        <Flex flexWrap="wrap" gap={2}>
                          {userTags?.datasetTags?.length > 0 ? (
                            userTags.datasetTags.map((dataset: { id: string; name: string }) => (
                              <ChakraTag
                                key={dataset.id}
                                colorScheme="purple"
                                size="sm"
                                borderRadius="full"
                              >
                                <TagLabel>{dataset.name}</TagLabel>
                              </ChakraTag>
                            ))
                          ) : (
                            <Text color="gray.500" fontSize="sm">
                              暂无知识库权限
                            </Text>
                          )}
                        </Flex>
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
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
