import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseMetadataDto {
  @ApiProperty({
    description: 'Response timestamp',
    example: '2024-01-01T00:00:00Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Unique request identifier',
    example: 'abc-123',
  })
  requestId: string;
}

export class ApiErrorDetailDto {
  @ApiProperty({
    description: 'Field name where error occurred',
    example: 'email',
    required: false,
  })
  field?: string;

  @ApiProperty({
    description: 'Error code',
    example: 'INVALID_FORMAT',
  })
  code: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Invalid email format',
  })
  message: string;
}

export class ApiErrorDto {
  @ApiProperty({
    description: 'Machine-readable error code',
    example: 'VALIDATION_ERROR',
  })
  code: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Invalid input',
  })
  message: string;

  @ApiProperty({
    description: 'Detailed error information',
    type: [ApiErrorDetailDto],
    required: false,
  })
  details?: ApiErrorDetailDto[];
}

export class ApiResponseDto<T> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'The response data',
  })
  data: T;

  @ApiProperty({
    description: 'Response metadata',
  })
  meta: ApiResponseMetadataDto;
}

export class ApiErrorResponseDto {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: false,
  })
  success: boolean;

  @ApiProperty({
    description: 'The error information',
  })
  error: ApiErrorDto;

  @ApiProperty({
    description: 'Response metadata',
  })
  meta: ApiResponseMetadataDto;
}
