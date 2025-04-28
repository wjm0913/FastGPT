import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Badge,
  VStack,
  Icon,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  Link,
  useDisclosure
} from '@chakra-ui/react';
import { InfoIcon, TimeIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import dayjs from 'dayjs';

interface FeishuNode {
  node_token: string;
  title: string;
  has_child: boolean;
  obj_type: string;
  obj_token?: string;
  create_time?: number;
  update_time?: number;
  document_detail?: document_detailType;
  children?: FeishuNode[];
}

type document_detailType = {
  document: {
    cover: any;
    document_id: string;
    revision_id: number;
  };
};

// 飞书知识库节点组件
// eslint-disable-next-line react/display-name
const TreeNode = React.memo(
  ({ node, level = 0, updatedAt }: { node: FeishuNode; level?: number; updatedAt: string }) => {
    const [isExpanded, setIsExpanded] = useState(level < 1);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const detailRef = useRef(null);

    const handleToggle = () => {
      setIsExpanded(!isExpanded);
    };

    // 格式化时间
    const formatDate = (timestamp?: number) => {
      if (!timestamp) return '未知';
      const date = new Date(timestamp * 1000);
      return date.toLocaleString();
    };

    // 获取文档类型徽章颜色
    const getBadgeColor = (type?: string) => {
      switch (type) {
        case 'docx':
          return 'blue';
        case 'sheet':
          return 'green';
        case 'mindnote':
          return 'purple';
        case 'bitable':
          return 'orange';
        case 'slides':
          return 'yellow';
        default:
          return 'gray';
      }
    };

    useEffect(() => {
      console.log('updatedAt', updatedAt);
    }, [updatedAt]);

    return (
      <Box my={1}>
        <Flex
          align="center"
          pl={level * 4}
          py={1}
          borderRadius="md"
          _hover={{ bg: 'gray.50' }}
          cursor="pointer"
          onClick={node.has_child ? handleToggle : undefined}
        >
          {node.has_child && (
            <Box mr={1} color="gray.500">
              {isExpanded ? '▼' : '►'}
            </Box>
          )}
          <Box mr={2} color={node.has_child ? 'blue.500' : 'gray.500'}>
            {node.has_child ? '📁' : '📄'}
          </Box>
          <Text fontWeight={node.has_child ? 'bold' : 'normal'}>{node.title}</Text>
          {node.obj_type && (
            <Badge ml={2} size="sm" colorScheme={getBadgeColor(node.obj_type)} fontSize="xs">
              {node.obj_type}
            </Badge>
          )}

          {node.document_detail && (
            <Popover isOpen={isOpen} onClose={onClose} placement="right" closeOnBlur={true} isLazy>
              <PopoverTrigger>
                <Icon
                  as={InfoIcon}
                  ml={2}
                  cursor="pointer"
                  color="blue.500"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  ref={detailRef}
                />
              </PopoverTrigger>
              <PopoverContent width="240px" _focus={{ outline: 'none' }}>
                <PopoverArrow />
                <PopoverCloseButton />
                <PopoverBody p={3}>
                  {node.document_detail ? (
                    <VStack align="start" spacing={2}>
                      <Text fontWeight="bold" fontSize="sm">
                        {node.title}
                      </Text>
                      <Flex align="center" width="full">
                        <Text fontSize="xs" color="gray.600">
                          保存时间: {dayjs(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
                        </Text>
                      </Flex>
                      {/* <Flex align="center" width="full">
                      <TimeIcon mr={1} color="gray.500" />
                      <Text fontSize="xs" color="gray.600">更新: {formatDate(new Date(node.document_detail.document.update_time))}</Text>
                    </Flex> */}
                      {node.document_detail.document.revision_id && (
                        <Text fontSize="xs" color="gray.600">
                          修订版本: {node.document_detail.document.revision_id}
                        </Text>
                      )}
                    </VStack>
                  ) : (
                    <Text fontSize="xs" color="gray.500">
                      无详细信息
                    </Text>
                  )}
                </PopoverBody>
              </PopoverContent>
            </Popover>
          )}
        </Flex>

        {isExpanded && node.children && node.children.length > 0 && (
          <VStack align="stretch" mt={1} spacing={0}>
            {node.children.map((child) => (
              <TreeNode key={child.node_token} node={child} level={level + 1} updatedAt={''} />
            ))}
          </VStack>
        )}
      </Box>
    );
  }
);

export default TreeNode;
