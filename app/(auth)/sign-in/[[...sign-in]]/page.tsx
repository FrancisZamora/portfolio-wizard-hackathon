import { SignIn } from '@clerk/nextjs'
import wizardLogo from "@/images/wizard.png";
import Image from 'next/image';

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="mb-8">
        <Image src={wizardLogo} alt="Wizard Logo" width={80} height={80} />
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-background/50 backdrop-blur-sm border border-violet-500/20",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton: "bg-background/50 border border-violet-500/20 hover:bg-violet-500/10",
            formButtonPrimary: "bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700",
            footerActionLink: "text-violet-500 hover:text-violet-600",
            formFieldInput: "bg-background/50 border-violet-500/20 focus:border-violet-500",
          },
        }}
      />
    </div>
  );
}