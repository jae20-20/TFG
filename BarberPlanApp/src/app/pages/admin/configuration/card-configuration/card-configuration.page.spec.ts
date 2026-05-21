import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardConfigurationPage } from './card-configuration.page';

describe('CardConfigurationPage', () => {
  let component: CardConfigurationPage;
  let fixture: ComponentFixture<CardConfigurationPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CardConfigurationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
