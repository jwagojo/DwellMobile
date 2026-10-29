import HostWizard from '@/components/host/HostWizard';

/** Same wizard as /host/new, opened on Review with the published listing filled in. */
export default function EditListing() {
  return <HostWizard mode="edit" />;
}
