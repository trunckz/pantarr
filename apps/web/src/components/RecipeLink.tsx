// Link to a recipe: the Pantarr recipe page (same tab) when Mealie is not public, else Mealie in a new tab.
import { Anchor, type AnchorProps } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function RecipeLink({ url, children, ...rest }: { url: string; children: ReactNode; onClick?: (e: React.MouseEvent) => void } & AnchorProps) {
  if (url.startsWith("/")) return <Anchor component={Link} to={url} {...rest}>{children}</Anchor>;
  return <Anchor href={url} target="_blank" rel="noopener" {...rest}>{children} ↗</Anchor>;
}
