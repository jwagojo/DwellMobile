import ComingSoon from '@/components/ComingSoon';
import { SIGNUP_PATH } from '@/shared/lib/hostEntry';

export default function Session() {
  return <ComingSoon title="Your session" milestone="milestone 6" signedOutTo={SIGNUP_PATH} />;
}
