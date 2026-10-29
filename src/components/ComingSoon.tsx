import { Redirect, type Href } from 'expo-router';

import { useApp } from '@/state/AppState';
import Header from './Header';
import { Card, Lead, Screen, Title } from './ui';

/**
 * Stand-in for a screen a later migration milestone builds (MIGRATION_PROMPT.md), so the links that lead to it work
 * now. Applies the web page's sign-in guard: signed-out visitors go to sign-up, with `next=host` for host screens.
 */
export default function ComingSoon({ title, milestone, signedOutTo }: { title: string; milestone: string; signedOutTo?: string }) {
  const { user } = useApp();
  if (signedOutTo && !user) return <Redirect href={signedOutTo as Href} />;
  return (
    <Screen header={<Header />}>
      <Card>
        <Title>{title}</Title>
        <Lead>This screen comes with {milestone} of the mobile migration.</Lead>
      </Card>
    </Screen>
  );
}
