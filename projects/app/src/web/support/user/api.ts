import { GET, POST, PUT } from '@/web/common/api/request';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import type { UserUpdateParams } from '@/types/user';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import type {
  FastLoginProps,
  OauthLoginProps,
  PostLoginProps,
  SearchResult
} from '@fastgpt/global/support/user/api.d';
import type {
  AccountRegisterBody,
  GetWXLoginQRResponse
} from '@fastgpt/global/support/user/login/api.d';

export const sendAuthCode = (data: {
  username: string;
  type: `${UserAuthTypeEnum}`;
  googleToken: string;
  captcha: string;
}) => POST(`/proApi/support/user/inform/sendAuthCode`, data);

export const getTokenLogin = () =>
  GET<UserType>('/support/user/account/tokenLogin', {}, { maxQuantity: 1 });
export const oauthLogin = (params: OauthLoginProps) =>
  POST<ResLogin>('/proApi/support/user/account/login/oauth', params);
export const postFastLogin = (params: FastLoginProps) =>
  POST<ResLogin>('/proApi/support/user/account/login/fastLogin', params);
export const ssoLogin = (params: any) => GET<ResLogin>('/proApi/support/user/account/sso', params);

export const postRegister = ({
  username,
  password,
  code,
  inviterId,
  bd_vid,
  fastgpt_sem
}: AccountRegisterBody) =>
  POST<ResLogin>(`/proApi/support/user/account/register/emailAndPhone`, {
    username,
    code,
    inviterId,
    bd_vid,
    fastgpt_sem,
    password: hashStr(password)
  });

export const postRegister2 = ({
  username,
  password,
  code,
  inviterId,
  bd_vid,
  fastgpt_sem
}: AccountRegisterBody) =>
  POST<{ success: boolean; message: string }>(`/support/user/account/register`, {
    username,
    code,
    inviterId,
    bd_vid,
    fastgpt_sem,
    password: hashStr(password)
  });

export const postFindPassword = ({
  username,
  code,
  password
}: {
  username: string;
  code: string;
  password: string;
}) =>
  POST<ResLogin>(`/proApi/support/user/account/password/updateByCode`, {
    username,
    code,
    password: hashStr(password)
  });

export const updatePasswordByOld = ({ oldPsw, newPsw }: { oldPsw: string; newPsw: string }) =>
  POST('/support/user/account/updatePasswordByOld', {
    oldPsw: hashStr(oldPsw),
    newPsw: hashStr(newPsw)
  });

export const updateNotificationAccount = (data: { account: string; verifyCode: string }) =>
  PUT('/proApi/support/user/team/updateNotificationAccount', data);

export const updateContact = (data: { contact: string; verifyCode: string }) => {
  return PUT('/proApi/support/user/account/updateContact', data);
};

export const postLogin = ({ password, ...props }: PostLoginProps) =>
  POST<ResLogin>('/support/user/account/loginByPassword', {
    ...props,
    password: hashStr(password)
  });

export const loginOut = () => GET('/support/user/account/loginout');

export const putUserInfo = (data: UserUpdateParams) => PUT('/support/user/account/update', data);

export const getWXLoginQR = () =>
  GET<GetWXLoginQRResponse>('/proApi/support/user/account/login/wx/getQR');

export const getWXLoginResult = (code: string) =>
  GET<ResLogin>(`/proApi/support/user/account/login/wx/getResult`, { code });

export const getCaptchaPic = (username: string) =>
  GET<{
    captchaImage: string;
  }>('/proApi/support/user/account/captcha/getImgCaptcha', { username });

export const postSyncMembers = () => POST('/proApi/support/user/team/org/sync');

export const GetSearchUserGroupOrg = (
  searchKey: string,
  options?: {
    members?: boolean;
    orgs?: boolean;
    groups?: boolean;
  }
) => GET<SearchResult>('/proApi/support/user/search', { searchKey, ...options });

export const ExportMembers = () => GET<{ csv: string }>('/proApi/support/user/team/member/export');

export const sendEmailCodeFunc = ({ email }: { email: string }) =>
  POST<{ success: boolean; message: string }>('/support/user/account/sendEmailCode', {
    email
  });

/**
 * 获取用户标签信息
 * @returns 用户标签和权限信息
 */
export const getUserTags = () =>
  GET<{
    tagInfo: {
      isOwner: boolean;
      isAdmin: boolean;
      hasAdminAccess: boolean;
      canCreateContent: boolean;
      canEditTeam: boolean;
      canInviteUsers: boolean;
      tagsList: string[];
    };
    isFirstTime: boolean;
    availableTags: string[];
  }>('/support/user/account/getUserId2');

/**
 * 更新用户标签
 * @param data 更新参数
 */
export const updateUserTags = (data: {
  targetUserId?: string; // 要更新的用户ID，不提供则更新当前用户
  tags: string[]; // 新的标签数组
}) =>
  POST<{
    userId: string;
    tags: string[];
    updated: boolean;
  }>('/support/user/account/getUserId2', data);

/**
 * 获取所有用户及其标签信息
 * @returns 所有用户及其标签信息
 */
export const getAllUsersWithTags = () =>
  GET<{
    users: Array<{
      userId: string;
      username: string;
      tags: string[];
    }>;
    availableTags: string[];
  }>('/support/user/account/getUserId2', { allUsers: true });
