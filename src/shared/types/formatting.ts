export interface FormattingStyle {
  textColor?: string;
  backgroundColor?: string;
  fill?: string;
  stroke?: string;
}

export interface ConditionalFormatRule {
  id: string;
  targetColumn?: string;
  conditionExpression: string;
  styles: FormattingStyle;
}
