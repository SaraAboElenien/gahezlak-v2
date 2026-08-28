export interface VerificationCode {
  code: string | null;
  expireAt: string | null;
  reason: string | null;
}

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  newEmail?: string | null;
  role: string;
  shop: string;
  verificationCode: VerificationCode;
  createdAt: string;
  updatedAt: string;
}

// Add types for the user profile response

export interface UserProfile {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  role: {
    _id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  shop?: {
    _id: string;
    name: string;
    type: string;
    phoneNumber: string;
    email: string;
    address: {
      country: string;
      city: string;
      street: string;
    };
    subscriptionId?: {
      _id: string;
      plan: {
        _id: string;
        planGroup: string;
        title: string;
        description: string;
        frequency: string;
        currency: string;
        price: number;
        features: string[];
        isActive: boolean;
      };
      status: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
    };
    logoUrl?: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface UserProfileResponse {
  message: string;
  data: UserProfile;
}

export interface UpdateProfileResponse {
  message: string;
  data: {
    message: string;
    user: UserProfile;
  };
}

export interface RequestChangeMailResponse {
  message: string;
  data: object;
}
export interface ConfirmChangeMailResponse {
  message: string;
  data: {
    user: UserProfile;
    message: string;
  };
}

export interface ChangePasswordResponse {
  message: string;
  data: object;
}

export interface UpdateProfileResponse {
  message: string;
  data: {
    message: string;
    user: UserProfile;
  };
}

export interface RequestChangeMailResponse {
  message: string;
  data: object;
}
export interface ConfirmChangeMailResponse {
  message: string;
  data: {
    user: UserProfile;
    message: string;
  };
}
