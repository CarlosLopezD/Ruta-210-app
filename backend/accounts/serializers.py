from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .tokens import email_verification_token, password_reset_token

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "display_name", "is_email_verified"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ["email", "password", "display_name"]

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe una cuenta con ese email.")
        return email

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds account-lockout and email-verification checks on top of
    SimpleJWT's default (already generic — "no active account found with
    the given credentials" — error, which we keep to avoid leaking whether
    an email is registered)."""

    def validate(self, attrs):
        email = (attrs.get("email") or "").strip().lower()
        user = User.objects.filter(email__iexact=email).first()

        if user and user.is_locked():
            raise serializers.ValidationError(
                {
                    "detail": "Cuenta bloqueada temporalmente por demasiados intentos fallidos. Probá de nuevo en unos minutos.",
                    "code": "account_locked",
                }
            )

        try:
            data = super().validate(attrs)
        except exceptions.AuthenticationFailed:
            if user:
                user.register_failed_login()
            raise

        if user:
            user.reset_failed_logins()

        if not self.user.is_email_verified:
            raise serializers.ValidationError(
                {
                    "detail": "Confirmá tu email antes de iniciar sesión. Revisá tu bandeja de entrada.",
                    "code": "email_not_verified",
                }
            )

        data["user"] = UserSerializer(self.user).data
        return data


class EmailVerifySerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):
        try:
            pk = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError("Enlace inválido o expirado.")

        if not email_verification_token.check_token(user, attrs["token"]):
            raise serializers.ValidationError("Enlace inválido o expirado.")

        attrs["user"] = user
        return attrs


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            pk = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError("Enlace inválido o expirado.")

        if not password_reset_token.check_token(user, attrs["token"]):
            raise serializers.ValidationError("Enlace inválido o expirado.")

        validate_password(attrs["new_password"], user=user)
        attrs["user"] = user
        return attrs
