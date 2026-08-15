/* PIXVA V11.8.1 ADMIN WRAPPER */
import AdminAccounts from './AdminAccounts.jsx';
import AdminLegacy from './AdminLegacy.jsx';

export default function Admin(props){
  return <div className="pixva-admin-combined">
    <AdminAccounts/>
    <AdminLegacy {...props}/>
  </div>;
}
