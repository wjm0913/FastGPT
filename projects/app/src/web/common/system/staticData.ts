import { getSystemInitData } from '@/web/common/system/api';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';

import { useSystemStore } from './useSystemStore';

export const clientInitData = async (
  retry = 3
): Promise<{
  feConfigs: FastGPTFeConfigsType;
}> => {
  try {
    const res = await getSystemInitData(useSystemStore.getState().initDataBufferId);
    console.log(res);

    // TODO 目前修改初始化data的地方，直接修改 res 数据。后续需要修改为调用 useSystemStore.getState().initStaticData(res) 方法。
    // {bufferId: '', feConfigs: {…}}
    let newRes = {
      ...res,
      feConfigs: {
        ...res.feConfigs,
        systemTitle: '光宇出行AI问答系统'
      }
    };
    useSystemStore.getState().initStaticData(newRes);

    return {
      feConfigs: res.feConfigs || useSystemStore.getState().feConfigs || {}
    };
  } catch (error) {
    if (retry > 0) {
      await delay(500);
      return clientInitData(retry - 1);
    }
    return Promise.reject(error);
  }
};
