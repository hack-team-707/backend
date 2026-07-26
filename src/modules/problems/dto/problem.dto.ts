import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class GeoCoordinatesDto {
  @ApiProperty()
  @IsLatitude()
  latitude!: number;

  @ApiProperty()
  @IsLongitude()
  longitude!: number;
}

export class CreateProblemDto {
  @ApiPropertyOptional()
  @ValidateIf((value: CreateProblemDto) => !value.audioUrl)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: CreateProblemDto) => !value.description?.trim())
  @IsUrl()
  audioUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  attachmentUrls?: string[];

  @ApiPropertyOptional({ type: GeoCoordinatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoCoordinatesDto)
  geolocation?: GeoCoordinatesDto;

  @ApiProperty({ enum: [true], description: 'Explicit user confirmation' })
  @IsBoolean()
  @Equals(true)
  confirmed!: true;
}
