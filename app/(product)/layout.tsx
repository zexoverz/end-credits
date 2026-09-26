import { FeedbackProvider } from "@/components/product/feedback";
import { ProductShell } from "@/components/product/shell";
import "./product.css";
import "./studio.css";
import "./desk.css";
import "./control-room.css";
import "./claim-flow.css";
import "./credits-desk.css";
export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeedbackProvider>
      <ProductShell>{children}</ProductShell>
    </FeedbackProvider>
  );
}
