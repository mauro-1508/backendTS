import { EraseUserTranslations, UnlinkUserSamples } from './ports/outbound/account_data_erasers';
import { makeEraseAccountData } from './application/erase_account_data';
import { makeUserDeletedHandler } from './adapters/inbound/events/user_deleted_subscriber';

export const makeAccountsModule = (deps: {
  eraseTranslations: EraseUserTranslations;
  unlinkSamples: UnlinkUserSamples;
}) => {
  const eraseAccountData = makeEraseAccountData(deps);

  return {
    eraseAccountData,
    userDeletedHandler: makeUserDeletedHandler({ eraseAccountData }),
  };
};
