export default function AuthSideSection() {
  return (
    <>
      {/* Left Side  */}
      <div className="w-1/2 relative hidden md:flex flex-col items-center justify-center space-y-6">
        <div className="absolute inset-0 z-0">
          <img src="/auth.png" alt="" className="w-full h-full object-cover " />
        </div>
      </div>
    </>
  );
}

// linear-gradient(to bottom right #ea580c , #d97706 , #ca8a04
