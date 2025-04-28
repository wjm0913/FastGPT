// FeishuSyncDrawer component (pagesComponent2)
import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Badge,
  Card,
  CardBody,
  Divider,
  Heading,
  useColorModeValue,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  SimpleGrid,
  Spinner
} from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { GET } from '@/web/common/api/request';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TreeNode from './TreeNode';

// 飞书知识库数据类型
interface FeishuSpace {
  description: string;
  name: string;
  open_sharing: string;
  space_id: string;
  space_type: string;
  visibility: string;
}

interface FeishuSpaceResponse {
  has_more: boolean;
  items: FeishuSpace[];
  page_token: string;
  updatedAt?: string;
}

// 飞书知识库节点类型
interface FeishuNode {
  creator: string;
  has_child: boolean;
  node_create_time: string;
  node_token: string;
  node_type: string;
  obj_create_time: string;
  obj_edit_time: string;
  obj_token: string;
  obj_type: string;
  origin_node_token: string;
  origin_space_id: string;
  owner: string;
  parent_node_token: string;
  space_id: string;
  title: string;
  create_time?: number;
  update_time?: number;
  children?: FeishuNode[]; // 子节点
}

interface FeishuNodeResponse {
  items: FeishuNode[];
  has_more: boolean;
  page_token: string;
  updatedAt: string;
}

const FeishuSyncDrawer = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [selectedSpace, setSelectedSpace] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [syncMethod, setSyncMethod] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [spaces, setSpaces] = useState<FeishuSpace[]>([]);
  const [isSpacesLoading, setIsSpacesLoading] = useState<boolean>(true);
  const [nodeList, setNodeList] = useState<FeishuNode[]>([]);
  const [isNodeListLoading, setIsNodeListLoading] = useState<boolean>(false);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState({
    isActive: false,
    progress: 0,
    currentFile: '',
    stage: '',
    totalFiles: 0,
    finishedFiles: 0
  });
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const syncStageRef = useRef('');

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBgColor = useColorModeValue('gray.50', 'gray.700');
  const selectedBgColor = useColorModeValue('blue.50', 'blue.900');
  const cardBgColor = useColorModeValue('white', 'gray.700');
  const overlayBgColor = useColorModeValue('rgba(0, 0, 40, 0.1)', 'rgba(0, 0, 20, 0.6)');
  const syncHintColor = useColorModeValue('blue.500', 'blue.200');

  // Reset form when drawer is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedSpace('');
      setSyncMethod('');
      setDescription('');
      fetchFeishuSpaces();
    }
  }, [isOpen]);

  // 获取飞书知识库列表
  const fetchFeishuSpaces = async () => {
    setIsSpacesLoading(true);
    try {
      // 使用实际API获取飞书知识库列表
      const response = await GET<FeishuSpaceResponse>('/feishu2/feishuList');
      setSpaces(response.items || []);
    } catch (error) {
      console.error('获取飞书知识库失败', error);
      toast({
        status: 'error',
        title: '获取飞书知识库列表失败',
        description: '请稍后重试或联系管理员'
      });
    } finally {
      setIsSpacesLoading(false);
    }
  };

  // 获取知识库的节点结构
  const fetchSpaceNodes = async (spaceId: string, refresh: boolean = false) => {
    setIsNodeListLoading(true);
    setNodeList([]);

    try {
      // 获取知识库节点列表，添加refresh参数
      const response = await GET<FeishuNodeResponse>(
        '/feishu2/feishuItemtree',
        {
          space_id: spaceId,
          refresh: refresh ? 'true' : 'false' // 添加refresh参数
        },
        {
          timeout: 10000000
        }
      );
      console.log('知识库节点列表:', response);

      if (response && response.items) {
        setNodeList(response.items || []);
        setUpdatedAt(response.updatedAt);
        console.log('知识库节点列表:', response.items);
      }
    } catch (error) {
      console.error('获取知识库节点列表失败', error);
      toast({
        status: 'error',
        title: '获取知识库结构失败',
        description: '请稍后重试'
      });
    } finally {
      setIsNodeListLoading(false);
    }
  };

  // 筛选知识库
  const filteredSpaces = spaces.filter(
    (space) =>
      space.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      space.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 处理同步操作
  const handleSync = async () => {
    if (!selectedSpace) {
      toast({
        status: 'error',
        title: '请选择知识库'
      });
      return;
    }

    if (!syncMethod) {
      toast({
        status: 'error',
        title: '请选择同步方式'
      });
      return;
    }

    try {
      // 关闭之前的连接
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setIsLoading(true);
      setSyncStatus({
        isActive: true,
        progress: 0,
        currentFile: '准备同步...',
        stage: 'idle',
        totalFiles: 0,
        finishedFiles: 0
      });

      // 添加时间戳和随机数避免缓存
      const params = new URLSearchParams({
        space_id: selectedSpace,
        name: selectedSpaceInfo?.name || '',
        intro: selectedSpaceInfo?.description || '',
        _t: `${Date.now()}-${Math.random()}`
      });

      const source = new EventSource(`/api/feishu2/FullSynchronization?${params.toString()}`);
      eventSourceRef.current = source;

      source.onopen = () => {
        console.log('SSE连接已建立');
      };

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('收到同步进度数据:', data);

          // 忽略保活消息
          if (data.keepAlive) return;

          if (data.error) {
            // 处理错误
            toast({
              status: 'error',
              title: '同步失败',
              description: data.error
            });
            setSyncStatus((prev) => ({
              ...prev,
              isActive: false,
              stage: 'error'
            }));
            source.close();
            setIsLoading(false);
            return;
          }

          if (data.done) {
            // 处理完成
            console.log('同步完成:', data);
            setSyncStatus((prev) => ({
              ...prev,
              progress: 100,
              currentFile: '同步完成!',
              stage: 'complete',
              finishedFiles: data.successCount || prev.finishedFiles
            }));

            toast({
              status: 'success',
              title: '同步完成',
              description: `成功处理 ${data.successCount} 个文件`
            });

            setTimeout(() => {
              source.close();
              setIsLoading(false);
              setSyncStatus((prev) => ({ ...prev, isActive: false }));
              setTimeout(() => onClose(), 1500);
            }, 1000);
            return;
          }

          // 更新进度
          if (data.progressPercent !== undefined) {
            // 记录当前阶段
            if (data.stage) {
              syncStageRef.current = data.stage;
            }

            // 标准化进度，确保不超过100%
            const normalizedPercent = Math.min(Math.max(0, Number(data.progressPercent)), 100);

            setSyncStatus((prev) => ({
              ...prev,
              progress: normalizedPercent,
              currentFile: data.currentTitle || prev.currentFile,
              stage: data.stage || syncStageRef.current || prev.stage,
              finishedFiles: data.successCount || prev.finishedFiles
            }));
          }
        } catch (error) {
          console.error('解析SSE消息失败:', error, event.data);
        }
      };

      source.onerror = (error) => {
        console.error('SSE连接错误:', error);
        toast({
          status: 'warning',
          title: '提示',
          description: '请检查同步日志'
        });
        setSyncStatus((prev) => ({
          ...prev,
          isActive: false,
          stage: 'error'
        }));
        source.close();
        setIsLoading(false);
      };
    } catch (err) {
      console.error('同步异常:', err);
      setIsLoading(false);
      setSyncStatus((prev) => ({
        ...prev,
        isActive: false,
        stage: 'error'
      }));
    }
  };

  // 组件卸载时关闭EventSource连接
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // 根据同步阶段获取颜色
  const getSyncStageColor = () => {
    switch (syncStatus.stage) {
      case 'export':
      case 'export_save':
        return 'blue.400';
      case 'upload':
        return 'purple.400';
      case 'complete':
        return 'green.400';
      case 'error':
        return 'red.400';
      default:
        return 'gray.400';
    }
  };

  // 获取阶段名称
  const getStageName = () => {
    switch (syncStatus.stage) {
      case 'export':
        return '文档导出';
      case 'export_save':
        return '文件保存';
      case 'upload':
        return '知识上传';
      case 'complete':
        return '同步完成';
      case 'error':
        return '同步出错';
      default:
        return '准备中';
    }
  };

  // 获取选中的知识库信息
  const selectedSpaceInfo = spaces.find((space) => space.space_id === selectedSpace);

  // 处理刷新操作
  const handleRefresh = () => {
    if (!selectedSpace || isNodeListLoading) {
      toast({
        status: 'error',
        title: '请稍后再试'
      });
      return;
    }

    // 调用获取节点列表的方法，并传入refresh=true
    fetchSpaceNodes(selectedSpace, true);

    toast({
      status: 'info',
      title: '正在刷新知识库结构',
      description: '这可能需要一点时间...'
    });
  };

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="full">
      <DrawerOverlay />
      <DrawerContent maxW="1600px">
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" fontSize="xl">
          飞书知识库同步
        </DrawerHeader>

        <DrawerBody p={0}>
          <Flex h="full">
            {/* 左侧知识库列表 */}
            <Box
              w="800px"
              borderRightWidth="1px"
              borderColor={borderColor}
              h="full"
              overflowY="auto"
            >
              <Box p={4}>
                <InputGroup mb={4}>
                  <InputLeftElement pointerEvents="none">
                    <MyIcon name="common/searchLight" w="20px" />
                  </InputLeftElement>
                  <Input
                    placeholder="搜索知识库"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </InputGroup>

                {isSpacesLoading ? (
                  <SimpleGrid columns={2} spacing={3}>
                    {[1, 2, 3, 4].map((_, i) => (
                      <Box
                        key={i}
                        p={3}
                        borderWidth="1px"
                        borderRadius="md"
                        h="100px"
                        bg="gray.100"
                      />
                    ))}
                  </SimpleGrid>
                ) : filteredSpaces.length === 0 ? (
                  <Box textAlign="center" py={10} color="gray.500">
                    未找到匹配的知识库
                  </Box>
                ) : (
                  <SimpleGrid columns={3} spacing={3}>
                    {filteredSpaces.map((space) => (
                      <Box
                        key={space.space_id}
                        p={3}
                        borderWidth="1px"
                        borderRadius="md"
                        bg={selectedSpace === space.space_id ? selectedBgColor : bgColor}
                        cursor="pointer"
                        _hover={{ bg: hoverBgColor }}
                        onClick={() => {
                          if (isNodeListLoading) {
                            toast({
                              status: 'error',
                              title: '请稍后'
                            });
                            return;
                          }
                          setSelectedSpace(space.space_id);
                          // 获取知识库节点列表
                          fetchSpaceNodes(space.space_id);
                        }}
                        h="auto"
                        maxH="110px"
                        overflow="hidden"
                        position="relative"
                      >
                        <VStack align="start" spacing={1}>
                          <Flex w="full" justifyContent="space-between" alignItems="center">
                            <Text fontWeight="bold" fontSize="md" noOfLines={1}>
                              {space.name}
                            </Text>
                            <Badge
                              colorScheme={space.visibility === 'private' ? 'red' : 'green'}
                              fontSize="xs"
                            >
                              {space.visibility === 'private' ? '私有' : '公开'}
                            </Badge>
                          </Flex>
                          <Text fontSize="sm" color="gray.500" noOfLines={2}>
                            {space.description || '无描述'}
                          </Text>
                        </VStack>
                      </Box>
                    ))}
                  </SimpleGrid>
                )}
              </Box>
            </Box>

            {/* 右侧详情和同步设置 */}
            <Box flex={1} p={6}>
              {selectedSpace ? (
                <VStack spacing={8} align="stretch">
                  <Box>
                    <Heading size="md" mb={4}>
                      知识库详情
                    </Heading>
                    <Card position="relative">
                      <CardBody>
                        <SimpleGrid columns={2} spacing={4}>
                          <Box>
                            <Text color="gray.500" fontSize="sm">
                              知识库名称
                            </Text>
                            <Text fontSize="md" fontWeight="bold">
                              {selectedSpaceInfo?.name}
                            </Text>
                          </Box>

                          <Box>
                            <Text color="gray.500" fontSize="sm">
                              知识库ID
                            </Text>
                            <Text fontSize="sm">{selectedSpaceInfo?.space_id}</Text>
                          </Box>

                          <Box>
                            <Text color="gray.500" fontSize="sm">
                              知识库类型
                            </Text>
                            <Badge>{selectedSpaceInfo?.space_type}</Badge>
                          </Box>

                          {selectedSpaceInfo?.description && (
                            <Box>
                              <Text color="gray.500" fontSize="sm">
                                描述
                              </Text>
                              <Text fontSize="sm" noOfLines={2}>
                                {selectedSpaceInfo.description}
                              </Text>
                            </Box>
                          )}
                        </SimpleGrid>
                      </CardBody>
                    </Card>
                  </Box>

                  <Divider />

                  {/* 显示知识库节点结构 */}
                  <Box>
                    <Flex justifyContent="space-between" alignItems="center" mb={4}>
                      <Heading size="md">知识库结构</Heading>
                      <Flex align="center">
                        {isNodeListLoading && <Spinner size="sm" mr={3} />}
                        <Button
                          size="sm"
                          leftIcon={<MyIcon name="common/refreshLight" w="14px" />}
                          onClick={handleRefresh}
                          isDisabled={isNodeListLoading || !selectedSpace}
                        >
                          强制刷新feishuApi并更新本地数据
                        </Button>
                      </Flex>
                    </Flex>
                    <Card position="relative">
                      {/* 这里保留知识库结构水波纹同步效果 */}
                      {syncStatus.isActive && (
                        <Box
                          position="absolute"
                          top="0"
                          left="0"
                          width="100%"
                          height="100%"
                          zIndex={2}
                          pointerEvents="none"
                        >
                          {/* 背景蒙层 */}
                          <Box
                            position="absolute"
                            top="0"
                            left="0"
                            width="100%"
                            height="100%"
                            bg={overlayBgColor}
                            opacity="0.15"
                            backdropFilter="blur(1px)"
                          />

                          {/* 水波纹动画 */}
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Box
                              key={i}
                              position="absolute"
                              bottom="0"
                              left="50%"
                              width={`${80 + i * 20}%`}
                              height="15px"
                              borderRadius="50%"
                              border="2px solid"
                              borderColor={getSyncStageColor()}
                              opacity={0.4 - i * 0.1}
                              transform={`translate(-50%, ${-syncStatus.progress}%)`}
                              transition="transform 0.8s ease-out"
                              _after={{
                                content: '""',
                                position: 'absolute',
                                top: '0',
                                left: '0',
                                right: '0',
                                bottom: '0',
                                borderRadius: '50%',
                                animation: `ripple ${2 + i * 0.5}s infinite ease-in-out`,
                                bg: `${getSyncStageColor()}40`
                              }}
                              sx={{
                                '@keyframes ripple': {
                                  '0%': { transform: 'scale(1)', opacity: 0.4 },
                                  '50%': { transform: 'scale(1.08)', opacity: 0.3 },
                                  '100%': { transform: 'scale(1)', opacity: 0.4 }
                                }
                              }}
                            />
                          ))}

                          {/* 当前文件标签 */}
                          <Flex
                            position="absolute"
                            bottom="15px"
                            left="50%"
                            transform={`translate(-50%, ${-syncStatus.progress}%)`}
                            transition="transform 0.8s ease-out"
                            alignItems="center"
                            justifyContent="center"
                            bg={cardBgColor}
                            color={getSyncStageColor()}
                            borderRadius="full"
                            boxShadow="0 4px 12px rgba(0,0,0,0.2)"
                            px={5}
                            py={2}
                            minW="300px"
                            textAlign="center"
                            borderWidth="2px"
                            borderColor={getSyncStageColor()}
                          >
                            <Box
                              w="10px"
                              h="10px"
                              borderRadius="full"
                              bg={getSyncStageColor()}
                              mr={3}
                              animation="pulse 1.5s infinite"
                              sx={{
                                '@keyframes pulse': {
                                  '0%': { opacity: 0.4, transform: 'scale(0.8)' },
                                  '50%': { opacity: 1, transform: 'scale(1.2)' },
                                  '100%': { opacity: 0.4, transform: 'scale(0.8)' }
                                }
                              }}
                            />
                            <Text fontSize="md" fontWeight="600" isTruncated>
                              {syncStatus.currentFile || '准备中...'}
                            </Text>
                          </Flex>

                          {/* 进度文本 */}
                          <Flex
                            position="absolute"
                            top="15px"
                            right="15px"
                            bg={cardBgColor}
                            borderRadius="lg"
                            boxShadow="0 4px 8px rgba(0,0,0,0.15)"
                            p={3}
                            alignItems="center"
                          >
                            <Badge
                              colorScheme={
                                syncStatus.stage === 'export' || syncStatus.stage === 'export_save'
                                  ? 'blue'
                                  : syncStatus.stage === 'upload'
                                    ? 'purple'
                                    : syncStatus.stage === 'complete'
                                      ? 'green'
                                      : 'gray'
                              }
                              fontSize="md"
                              px={2}
                              py={1}
                            >
                              {getStageName()}
                            </Badge>
                            <Text ml={3} fontWeight="bold" fontSize="lg">
                              {syncStatus.progress}%
                            </Text>
                          </Flex>
                        </Box>
                      )}
                      <CardBody maxH={'calc(100vh - 520px)'} overflowY="auto">
                        {isNodeListLoading ? (
                          <Flex justify="center" align="center" h="200px">
                            <Spinner />
                          </Flex>
                        ) : nodeList.length === 0 ? (
                          <Box textAlign="center" py={4} color="gray.500">
                            无文档结构数据
                          </Box>
                        ) : (
                          <VStack align="stretch" spacing={1}>
                            {nodeList.map((node) => (
                              <TreeNode updatedAt={updatedAt} key={node.node_token} node={node} />
                            ))}
                          </VStack>
                        )}
                      </CardBody>
                    </Card>
                  </Box>

                  <Divider />
                </VStack>
              ) : (
                <VStack justify="center" align="center" h="full" spacing={4} color="gray.500">
                  <MyIcon name="core/dataset/feishuDatasetColor" w="80px" h="80px" />
                  <Text fontSize="lg">请从左侧选择要同步的飞书知识库</Text>
                </VStack>
              )}
            </Box>
          </Flex>
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" p={4}>
          <Box margin="0 20px" w="full">
            <FormControl isRequired mb={4}>
              <RadioGroup value={syncMethod} onChange={(val: string) => setSyncMethod(val)}>
                <HStack spacing={6}>
                  <Radio value="all">全量同步</Radio>
                  <Radio disabled value="incremental">
                    增量同步
                  </Radio>
                </HStack>
              </RadioGroup>
            </FormControl>
          </Box>
          <Button variant="outline" mr={3} onClick={onClose} isDisabled={isLoading}>
            取消
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSync}
            isLoading={isLoading}
            loadingText="同步中"
            isDisabled={!selectedSpace || !syncMethod || syncStatus.isActive}
            size="md"
            px={6}
          >
            开始同步
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default FeishuSyncDrawer;
