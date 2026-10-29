import ComingSoon from '@/components/ComingSoon';
import { SIGNUP_PATH } from '@/shared/lib/hostEntry';

export default function Search() {
  return <ComingSoon title="Find a charger" milestone="milestone 5" signedOutTo={SIGNUP_PATH} />;
}
