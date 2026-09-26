import { Page } from "@/components/ui";
import { STUDIO as S } from "@/lib/copy/studio";
import { Sessions } from "./sessions";
export default function SessionsPage() {
  return (
    <Page title={S.sessionsTitle}>
      <Sessions />
    </Page>
  );
}
