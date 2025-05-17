import React from "react";

const ExplorerLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className="bg-accent">
      {children}
    </div>
  );
};

export default ExplorerLayout;
