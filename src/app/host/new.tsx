import ComingSoon from '@/components/ComingSoon';
import { SIGNUP_FOR_HOSTING_PATH } from '@/shared/lib/hostEntry';

export default function NewListing() {
  return <ComingSoon title="List your charger" milestone="milestone 7" signedOutTo={SIGNUP_FOR_HOSTING_PATH} />;
}
