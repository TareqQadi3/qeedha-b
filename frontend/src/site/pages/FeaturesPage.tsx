import { useTranslation } from 'react-i18next';
import {
  FeatureItem,
  IconBranches,
  IconImport,
  IconLayers,
  IconLedger,
  IconPos,
  IconShield,
  IconUsers,
  IconWallet,
  PageHero,
} from '../components';

const ICONS = [IconPos, IconLayers, IconShield, IconLedger, IconWallet, IconImport, IconUsers, IconBranches];
const TONES = ['brand', 'accent', 'violet', 'brand', 'accent', 'violet', 'brand', 'accent'] as const;

export function FeaturesPage() {
  const { t } = useTranslation('site');
  const items = t('features.items', { returnObjects: true }) as { title: string; desc: string }[];

  return (
    <div>
      <PageHero eyebrow={t('nav.features')} title={t('features.title')} subtitle={t('features.subtitle')} />
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <FeatureItem key={item.title} icon={<Icon />} title={item.title} desc={item.desc} tone={TONES[i % TONES.length]} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
