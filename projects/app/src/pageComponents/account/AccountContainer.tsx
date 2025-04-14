import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useTranslation } from 'next-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import useGetUserTag from '@/utils/useGetUserTag';

export enum TabEnum {
  'info' = 'info',
  'promotion' = 'promotion',
  'usage' = 'usage',
  'bill' = 'bill',
  'inform' = 'inform',
  'setting' = 'setting',
  'thirdParty' = 'thirdParty',
  'individuation' = 'individuation',
  'apikey' = 'apikey',
  'loginout' = 'loginout',
  'team' = 'team',
  'model' = 'model',
  'tag' = 'tag'
}

const AccountContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs: newFeConfigs, systemVersion } = useSystemStore();
  let feConfigs = { ...newFeConfigs, isPlus: true };
  const router = useRouter();
  const { isPc } = useSystem();

  const currentTab = useMemo(() => {
    return router.pathname.split('/').pop() as TabEnum;
  }, [router.pathname]);

  const { hasTag } = useGetUserTag('theAIModel');
  const [tabList, setTabList] = useState<any[]>([]);

  useEffect(() => {
    if (hasTag !== undefined) {
      const updatedTabList = [
        {
          icon: 'support/user/userLight',
          label: t('account:personal_information'),
          value: TabEnum.info
        },
        ...(feConfigs?.isPlus
          ? [
              {
                icon: 'support/user/usersLight',
                label: t('account:team'),
                value: TabEnum.team
              },
              {
                icon: 'support/usage/usageRecordLight',
                label: t('account:usage_records'),
                value: TabEnum.usage
              }
            ]
          : []),
        ...(feConfigs?.show_pay && userInfo?.team?.permission.hasManagePer
          ? [
              {
                icon: 'support/bill/payRecordLight',
                label: t('account:bills_and_invoices'),
                value: TabEnum.bill
              }
            ]
          : []),
        ...(hasTag
          ? [
              {
                icon: 'common/model',
                label: t('account:model_provider'),
                value: TabEnum.model
              }
            ]
          : []),
        {
          icon: 'common/thirdParty',
          label: '权限标签',
          value: TabEnum.tag
        },
        ...(feConfigs?.show_promotion && userInfo?.team?.permission.isOwner
          ? [
              {
                icon: 'support/account/promotionLight',
                label: t('account:promotion_records'),
                value: TabEnum.promotion
              }
            ]
          : []),
        ...(hasTag && userInfo?.team?.permission.hasManagePer
          ? [
              {
                icon: 'key',
                label: t('account:api_key'),
                value: TabEnum.apikey
              }
            ]
          : []),
        ...(feConfigs.isPlus
          ? [
              {
                icon: 'support/user/informLight',
                label: t('account:notifications'),
                value: TabEnum.inform
              }
            ]
          : []),
        {
          icon: 'common/settingLight',
          label: t('common:common.Setting'),
          value: TabEnum.setting
        },
        {
          icon: 'support/account/loginoutLight',
          label: t('account:logout'),
          value: TabEnum.loginout
        }
      ];

      // Check if tabList needs updating before calling setState
      if (JSON.stringify(tabList) !== JSON.stringify(updatedTabList)) {
        setTabList(updatedTabList);
      }
    }
  }, [feConfigs, hasTag, t, userInfo, tabList]);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('account:confirm_logout')
  });

  const setCurrentTab = useCallback(
    (tab: string) => {
      if (tab === TabEnum.loginout) {
        openConfirm(() => {
          setUserInfo(null);
          router.replace('/login');
        })();
      } else {
        router.replace('/account/' + tab);
      }
    },
    [openConfirm, router, setUserInfo]
  );

  return (
    <PageContainer isLoading={isLoading}>
      <Flex flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
        {isPc ? (
          <Flex
            flexDirection={'column'}
            p={4}
            h={'100%'}
            flex={'0 0 200px'}
            borderRight={theme.borders.base}
          >
            <SideTabs<TabEnum>
              flex={1}
              mx={'auto'}
              mt={2}
              w={'100%'}
              list={tabList}
              value={currentTab}
              onChange={setCurrentTab}
            />
          </Flex>
        ) : (
          <Box mb={3}>
            <LightRowTabs<TabEnum>
              m={'auto'}
              w={'100%'}
              size={isPc ? 'md' : 'sm'}
              list={tabList.map((item) => ({
                value: item.value,
                label: item.label
              }))}
              value={currentTab}
              onChange={setCurrentTab}
            />
          </Box>
        )}

        <Box flex={'1 0 0'} h={'100%'} pb={[4, 0]} overflow={'auto'}>
          {children}
        </Box>
      </Flex>
      <ConfirmModal />
    </PageContainer>
  );
};

export default AccountContainer;
