import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="CCC Admin - Sign In"
        description="Sign in to your CCC Admin account to access the dashboard and manage your inventory, customers, and more."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
