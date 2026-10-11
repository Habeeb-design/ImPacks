import { notFound } from "next/navigation";
import { CategoryPack } from "../../../components/CategoryPack";
import { categories, categoryCopy, isCategory } from "../../../lib/category";

export function generateStaticParams() {
  return categories.map(theme => ({ theme }));
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!isCategory(theme)) return { title: "Category not found — ImPacks" };
  return { title: `${categoryCopy[theme].title} pack — ImPacks`, description: categoryCopy[theme].pitch };
}

export default async function CategoryPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  if (!isCategory(theme)) notFound();
  return <CategoryPack category={theme} />;
}
