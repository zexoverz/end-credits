// `/credits/[id]`: the credits roll (T8.1). The page only reads the id; the roll polls on the client.
import { Roll } from "./roll";

export default async function CreditsPage({ params }: PageProps<"/credits/[id]">) {
  const { id } = await params;
  return <Roll id={id} />;
}
