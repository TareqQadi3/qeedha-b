import { useTranslation } from 'react-i18next';
import { PartyPage } from './PartyPage';

export function SuppliersPage() {
  const { t } = useTranslation('party');
  return (
    <PartyPage
      title={t('suppliers.title')}
      endpoint="/suppliers"
      permissionPrefix="suppliers"
      addButtonLabel={t('suppliers.addButton')}
      showContactPerson
    />
  );
}
