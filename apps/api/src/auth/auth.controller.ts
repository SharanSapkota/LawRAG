import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { GoogleSyncDto } from "./dto/google-sync.dto";

@Controller("auth/google")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("sync")
  async sync(@Body() body: GoogleSyncDto) {
    const payload = await this.authService.verifyGoogleIdToken(body.idToken);
    const user = await this.authService.upsertUserFromGoogle(payload);
    const accessToken = this.authService.issueJwt(user);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
      },
    };
  }
}
