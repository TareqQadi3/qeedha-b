import { PartyPage } from './PartyPage';

export function SuppliersPage() {
  return (
    <PartyPage
      title="الموردون"
      endpoint="/suppliers"
      permissionPrefix="suppliers"
      addButtonLabel="+ مورد جديد"
      showContactPerson
    />
  );
}
