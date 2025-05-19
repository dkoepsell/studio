import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

interface AiHelperCardProps {
  title: string;
  icon: LucideIcon;
  content: string | null;
  isLoading: boolean;
  actionButton?: React.ReactNode;
  placeholderText?: string;
}

export default function AiHelperCard({ title, icon: Icon, content, isLoading, actionButton, placeholderText = "AI content will appear here once generated." }: AiHelperCardProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </div>
        {actionButton}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        ) : content ? (
          <div className="text-sm whitespace-pre-wrap">{content}</div>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholderText}</p>
        )}
      </CardContent>
    </Card>
  );
}
