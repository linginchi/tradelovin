import { setRequestLocale } from "next-intl/server";

import { VideoPlayerClient } from "@/components/video/VideoPlayerClient";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function VideoPlayerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl px-4 pt-3 sm:px-6">
        <Link href="/courses" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          返回课程
        </Link>
      </div>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12">
        <VideoPlayerClient />
      </div>
    </div>
  );
}
