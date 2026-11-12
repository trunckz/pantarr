import { Card, Text, Title, Badge, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";

export default function Soon({ which }: { which: "planning" | "shopping" | "pantry" }) {
  const { t } = useTranslation();
  return (
    <>
      <Title order={2} mb="md">{t(`nav.${which}`)}</Title>
      <Card withBorder maw={640}>
        <Group mb="xs"><Badge variant="light">{t("soon.title")}</Badge></Group>
        <Text>{t(`soon.${which}`)}</Text>
      </Card>
    </>
  );
}
