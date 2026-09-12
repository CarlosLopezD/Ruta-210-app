from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .emails import send_password_reset_email, send_verification_email
from .serializers import (
    EmailTokenObtainPairSerializer,
    EmailVerifySerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    ResendVerificationSerializer,
    UserSerializer,
)
from .models import User

GENERIC_RESET_MESSAGE = "Si existe una cuenta con ese email, te enviamos un correo con instrucciones."
GENERIC_RESEND_MESSAGE = "Si existe una cuenta con ese email y todavía no fue verificada, te reenviamos el correo."


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-login"

    def post(self, request, *args, **kwargs):
        # SimpleJWT's default post() puts {access, refresh, ...} straight in
        # the JSON body. We instead move the refresh token into an httpOnly
        # cookie (see accounts/cookies.py) so it's never reachable from
        # frontend JavaScript — only the access token and user stay in the body.
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)
        if refresh is not None:
            set_refresh_cookie(response, refresh)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Like SimpleJWT's TokenRefreshView, but reads the refresh token from
    the httpOnly cookie instead of the request body, and — since
    ROTATE_REFRESH_TOKENS is on — writes the rotated refresh token back to
    that same cookie instead of returning it in the JSON body."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not refresh:
            return Response(
                {"detail": "No se encontró una sesión para renovar. Iniciá sesión de nuevo."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = self.get_serializer(data={"refresh": refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            # Expired, blacklisted, or otherwise invalid — same outcome as a
            # missing cookie from the caller's point of view: log in again.
            raise InvalidToken(exc.args[0]) from exc

        response = Response({"access": serializer.validated_data["access"]}, status=status.HTTP_200_OK)
        rotated_refresh = serializer.validated_data.get("refresh")
        if rotated_refresh:
            set_refresh_cookie(response, rotated_refresh)
        return response


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-register"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_verification_email(user)
        return Response(
            {
                "detail": "Cuenta creada. Revisá tu email para confirmarla antes de iniciar sesión.",
                "email": user.email,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(generics.GenericAPIView):
    serializer_class = EmailVerifySerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-verify"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        if not user.is_email_verified:
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified"])
        return Response(UserSerializer(user).data)


class ResendVerificationView(generics.GenericAPIView):
    serializer_class = ResendVerificationSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-verify"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email, is_email_verified=False).first()
        if user:
            send_verification_email(user)
        return Response({"detail": GENERIC_RESEND_MESSAGE})


class PasswordResetRequestView(generics.GenericAPIView):
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-password-reset"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            send_password_reset_email(user)
        return Response({"detail": GENERIC_RESET_MESSAGE})


class PasswordResetConfirmView(generics.GenericAPIView):
    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-password-reset"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.reset_failed_logins()
        user.save()
        return Response({"detail": "Contraseña actualizada. Ya podés iniciar sesión."})


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth-login"

    def post(self, request):
        refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass  # already invalid/expired/blacklisted — logout still "succeeds"
        response = Response(status=status.HTTP_205_RESET_CONTENT)
        clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
