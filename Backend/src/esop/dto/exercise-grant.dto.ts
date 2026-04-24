import { IsInt, Min } from 'class-validator';

export class ExerciseGrantDto {
  @IsInt()
  @Min(1)
  sharesToExercise: number;
}
