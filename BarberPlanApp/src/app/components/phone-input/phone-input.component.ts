import { CommonModule } from '@angular/common';
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { PHONE_COUNTRIES, PhoneCountry, splitPhoneValue } from './phone.util';

@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './phone-input.component.html',
  styleUrls: ['./phone-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PhoneInputComponent),
      multi: true
    }
  ]
})
export class PhoneInputComponent implements ControlValueAccessor {
  @Input() placeholder = '600 123 456';

  countries = PHONE_COUNTRIES;
  selectedCountry: PhoneCountry = PHONE_COUNTRIES[0];
  nationalNumber = '';
  disabled = false;

  private onChangeFn: (value: string) => void = () => {};
  onTouchedFn: () => void = () => {};

  writeValue(value: string | null | undefined): void {
    const { dialCode, nationalNumber } = splitPhoneValue(value || '');
    this.selectedCountry = this.countries.find((country) => country.dialCode === dialCode) || this.countries[0];
    this.nationalNumber = nationalNumber;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onCountryDialChange(dialCode: string) {
    const found = this.countries.find((country) => country.dialCode === dialCode);
    if (found) this.selectedCountry = found;
    this.emitValue();
  }

  onNumberChange(value: string) {
    this.nationalNumber = value;
    this.emitValue();
  }

  private emitValue() {
    const digits = this.nationalNumber.replace(/\s+/g, '');
    this.onChangeFn(digits ? `${this.selectedCountry.dialCode}${digits}` : '');
  }
}
