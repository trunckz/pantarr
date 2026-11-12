// POST /feedback: a ticket written in the app, opened on the project's repository (feedback.ts).
import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { openIssue } from "./feedback";

class FeedbackDto {
  @IsIn(["bug", "feature"]) kind: "bug" | "feature";
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsString() @MinLength(10) @MaxLength(5000) description: string;
  @IsOptional() @IsString() @MaxLength(100) area?: string;
  @IsOptional() @IsString() @MaxLength(200) page?: string;
  @IsOptional() @IsString() @MaxLength(100) browser?: string;
  @IsOptional() @IsString() @MaxLength(20) extension?: string;
}

@ApiTags("feedback")
@Controller("feedback")
export class FeedbackController {
  /** Any signed-in user ; limited per address (common/security.ts). */
  @Post()
  send(@Body() b: FeedbackDto) {
    return openIssue(b);
  }
}
