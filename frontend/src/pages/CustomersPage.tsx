import { useTranslation } from 'react-i18next';
import { PartyPage } from './PartyPage';

export function CustomersPage() {
  const { t } = useTranslation('party');
  return (
    <PartyPage
      title={t('customers.title')}
      endpoint="/customers"
      permissionPrefix="customers"
      addButtonLabel={t('customers.addButton')}
    />
  );
}
