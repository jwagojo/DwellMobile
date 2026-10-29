import ComingSoon from '@/components/ComingSoon';
import { SIGNUP_FOR_HOSTING_PATH } from '@/shared/lib/hostEntry';

export default function HostHome() {
  return <ComingSoon title="Your listing" milestone="milestone 7" signedOutTo={SIGNUP_FOR_HOSTING_PATH} />;
}
