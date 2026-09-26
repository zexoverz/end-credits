import { ProductShell } from "@/components/product/shell";
import "./product.css";
export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductShell>{children}</ProductShell>;
}
