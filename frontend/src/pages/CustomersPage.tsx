import { PartyPage } from './PartyPage';

export function CustomersPage() {
  return (
    <PartyPage
      title="العملاء"
      endpoint="/customers"
      permissionPrefix="customers"
      addButtonLabel="+ عميل جديد"
    />
  );
}
